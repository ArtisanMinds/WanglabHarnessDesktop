//! bridge/pet.rs — 桌宠（外置透明宠物窗口）的 Tauri 命令出口。
//!
//! 这些命令被 dsh 容器（iframe 内的 dsh 界面 / dsh-tauri-pet 插件）经 invoke
//! 桥调用（壳层桥监听模块 `src/hooks/use-iframe-invoke.ts` 把 iframe 的
//! postMessage invoke 转发到 `@tauri-apps/api/core` 的 `invoke`）。所有状态
//! 读写统一落在 `config::setting`（持久化）与 `desktop::pet`（窗口）。
//! 错误遵循仓库约定：`Result<_, String>`，Err 以大写协议前缀开头（如
//! `PET_SIZE_OUT_OF_RANGE:`）。
//!
//! 实时性：一切会改变设置状态（开关/选择/大小）的命令都通过 `pet://status`
//! 事件把最新设置推给 pet 窗口；会话 CRUD 则通过独立的 `session:*` 事件直接转发。

use crate::config;
use crate::desktop::pet as pet_window;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, WebviewWindow};
use zip::ZipArchive;
use futures_util::StreamExt;

/// 宠物大小百分比合法区间（精灵图缩放 25%-200%，与插件设置页滑条一致）。
pub const PET_SIZE_MIN: f64 = pet_window::PET_SIZE_MIN_PERCENT;
pub const PET_SIZE_MAX: f64 = pet_window::PET_SIZE_MAX_PERCENT;

/// 升级时清除已移除的初始选择，不删除用户磁盘上的资源。
const REMOVED_PRESET_PET_ID: &str = "maid-deepseek-whale";
/// 导入桌宠资源包的压缩大小上限（32 MiB）。
const PET_PACKAGE_MAX_BYTES: usize = 32 * 1024 * 1024;
/// 防止 zip 炸弹的条目数与解压后总大小上限。
const PET_PACKAGE_MAX_ENTRIES: usize = 512;
const PET_PACKAGE_MAX_UNCOMPRESSED_BYTES: u64 = 128 * 1024 * 1024;
/// 清单和单张精灵图的读取上限。
const PET_MANIFEST_MAX_BYTES: u64 = 64 * 1024;
const PET_SPRITESHEET_MAX_BYTES: u64 = 8 * 1024 * 1024;
const PET_SPRITESHEET_MAX_DIMENSION: u32 = 16_384;
const PET_SPRITESHEET_MAX_PIXELS: u64 = 64 * 1024 * 1024;
const PET_SPRITE_COLUMNS: u8 = 8;

/// 设置变化推送给 pet 窗口的事件名；会话生命周期使用 `session:*` 事件。
pub const PET_STATUS_EVENT: &str = "pet://status";

/// 只驻留当前进程的可见性；会话动作和 Toast 完全由 pet WebView 管理。
#[derive(Debug, Clone)]
struct PetTransientState {
    visible: bool,
    ready: bool,
    error: Option<String>,
    render_id: u64,
    revision: u64,
}

impl Default for PetTransientState {
    fn default() -> Self {
        Self {
            visible: false,
            ready: false,
            error: None,
            render_id: 0,
            revision: 0,
        }
    }
}

impl PetTransientState {
    fn begin_render(&mut self, visible: bool) {
        self.visible = visible;
        self.ready = false;
        self.error = None;
        self.render_id += 1;
        self.revision += 1;
    }

    fn fail(&mut self, error: String) {
        self.visible = false;
        self.ready = false;
        self.error = Some(error);
        self.revision += 1;
    }

    fn report(&mut self, render_id: u64, error: Option<String>) -> bool {
        // 旧窗口请求、已收起窗口及加载失败后的迟到成功回调均不得重新点亮图标。
        if self.render_id != render_id || !self.visible {
            return false;
        }
        if let Some(error) = error {
            self.fail(error);
        } else if !self.ready {
            self.ready = true;
            self.revision += 1;
        } else {
            return false;
        }
        true
    }
}

fn transient_state() -> &'static Mutex<PetTransientState> {
    static STATE: OnceLock<Mutex<PetTransientState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(PetTransientState::default()))
}

/// 桌宠当前完整状态（设置页、插件与 pet 窗口读取）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetStatus {
    /// 桌宠能力是否永久启用。
    pub enabled: bool,
    /// 桌宠窗口当前是否应显示。
    pub visible: bool,
    /// 未选择宠物时为 None，不再自动补入默认资源。
    pub active_pet: Option<String>,
    /// 宠物大小百分比（25-200，100 = 精灵图原始尺寸）；None = 未设置（默认 100）。
    pub pet_size: Option<f64>,
    /// 媒体已在宠物 WebView 内成功解码，才允许主界面显示激活指示。
    pub ready: bool,
    pub error: Option<String>,
    /// 每次唤醒或切换生成新编号，隔离旧媒体的异步回调。
    pub render_id: u64,
    /// 主界面按修订号忽略迟到的命令应答，防止覆盖较新的加载结果。
    pub revision: u64,
}

/// 文件系统宠物的数据来源。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PetSource {
    Chat,
}

impl PetSource {
    /// 来源字符串是跨 iframe 的安全边界，只接受应用自己的宠物目录。
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "chat" => Ok(Self::Chat),
            _ => Err("PET_SOURCE_INVALID: source must be chat".to_string()),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Chat => "chat",
        }
    }
}

/// `pet.json` 的受支持字段；无版本标记的旧包按图集尺寸识别。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    sprite_version_number: Option<u8>,
    spritesheet_path: String,
}

/// 列表项保留 chat: 前缀，与已安装宠物的选择协议兼容。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PetListItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub sprite_rows: Option<u8>,
    pub source: String,
}

/// 实际渲染精灵图；字段保持 snake_case，与其他桌宠命令一致。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PetAsset {
    pub id: String,
    pub spritesheet: String,
    pub sprite_version_number: u8,
    pub columns: u8,
    pub rows: u8,
}

/// 缺省、已移除的初始宠物与非法选择均保持未选择状态。
fn normalize_active_pet(active_pet: Option<&str>) -> Option<String> {
    let id = active_pet.map(str::trim).filter(|id| !id.is_empty())?;
    validate_active_pet_id(id).ok().map(|_| id.to_string())
}

fn migrate_pet_selection(setting: &mut config::Setting) {
    setting.active_pet = normalize_active_pet(setting.active_pet.as_deref());
    if setting.active_pet.is_none() {
        setting.pet_enabled = false;
    }
}

/// 将持久设置和进程内瞬态状态合并为唯一的对外状态。
fn status_from_setting(setting: &config::Setting) -> PetStatus {
    let transient = transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone();
    status_from_state(setting, &transient)
}

fn status_from_state(setting: &config::Setting, transient: &PetTransientState) -> PetStatus {
    let active_pet = normalize_active_pet(setting.active_pet.as_deref());
    let enabled = setting.pet_enabled && active_pet.is_some();
    let visible = enabled && transient.visible;
    PetStatus {
        enabled,
        visible,
        active_pet,
        pet_size: setting.pet_size,
        ready: visible && transient.ready,
        error: transient.error.clone(),
        render_id: transient.render_id,
        revision: transient.revision,
    }
}

/// 同时通知宠物窗口与主窗口；主窗口再通过受限桥同步 iframe 中的图标。
fn emit_pet_status(app: &AppHandle, status: &PetStatus) {
    let _ = app.emit(PET_STATUS_EVENT, status.clone());
}

fn fail_pet(app: &AppHandle, error: String) -> String {
    log::error!("[pet] {error}");
    let _ = pet_window::set_pet_window_visible(app, false);
    transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .fail(error.clone());
    sync_pet_session_stream(app, false);
    emit_pet_status(
        app,
        &status_from_setting(&config::get_store_dat_setting(app)),
    );
    error
}

fn validate_pet_assets(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_active_pet_id(id)?;
    if id.contains(':') {
        return get_pet_asset(app.clone(), id.to_string()).map(|_| ());
    }
    let config = super::preset_pet::get_preset_pet_config(app.clone(), id.to_string())?;
    let assets = super::preset_pet::get_preset_pet_assets(app.clone(), id.to_string())?;
    let idle = config["animations"]["idle"]
        .as_array()
        .ok_or("PET_PRESET_ASSETS_MISSING: idle animation pool is missing")?;
    if idle.is_empty()
        || idle.iter().any(|name| {
            name.as_str()
                .is_none_or(|name| !assets.assets.contains_key(name))
        })
    {
        return Err("PET_PRESET_ASSETS_MISSING: idle animations are not installed".to_string());
    }
    Ok(())
}

fn validate_selected_pet(app: &AppHandle, setting: &config::Setting) -> Result<(), String> {
    let id = normalize_active_pet(setting.active_pet.as_deref())
        .ok_or("PET_NOT_SELECTED: select an installed pet first")?;
    validate_pet_assets(app, &id)
}

/// 在预创建窗口后恢复设置，旧默认宠物不会随升级重新启用。
pub fn restore_pet(app: &AppHandle) {
    let mut setting = config::get_store_dat_setting(app);
    let previous = (setting.active_pet.clone(), setting.pet_enabled);
    migrate_pet_selection(&mut setting);
    if previous != (setting.active_pet.clone(), setting.pet_enabled) {
        setting = config::update_store_dat_setting(app, migrate_pet_selection);
    }
    if setting.pet_enabled {
        let _ = set_pet_enabled(app.clone(), true);
    }
}

/// 查询桌宠当前完整状态。
#[tauri::command]
pub fn get_pet_status(app: AppHandle) -> PetStatus {
    status_from_setting(&config::get_store_dat_setting(&app))
}

/// 启用/停用桌宠；启用同时显示，停用同时隐藏并永久落盘。
#[tauri::command]
pub fn set_pet_enabled(app: AppHandle, enabled: bool) -> Result<PetStatus, String> {
    if enabled {
        validate_selected_pet(&app, &config::get_store_dat_setting(&app))
            .map_err(|error| fail_pet(&app, error))?;
    }
    pet_window::set_pet_window_visible(&app, enabled).map_err(|error| fail_pet(&app, error))?;
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.pet_enabled = enabled;
    });
    transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .begin_render(enabled);
    // 停用即无消费者：停掉宿主会话流订阅（启用时窗口已可见，直接恢复订阅）。
    sync_pet_session_stream(&app, enabled);
    let status = status_from_setting(&updated);
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 选择桌宠模型包并持久化 active_pet。
#[tauri::command]
pub fn set_active_pet(app: AppHandle, id: String) -> Result<PetStatus, String> {
    let id = id.trim().to_string();
    validate_pet_assets(&app, &id)?;
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.active_pet = Some(id);
    });
    let mut transient = transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let visible = transient.visible && updated.pet_enabled;
    transient.begin_render(visible);
    drop(transient);
    let status = status_from_setting(&updated);
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 设置宠物大小百分比（设置页滑条，25-200），并实时同步窗口尺寸。
#[tauri::command]
pub fn set_pet_size(app: AppHandle, size: f64) -> Result<PetStatus, String> {
    if !size.is_finite() || !(PET_SIZE_MIN..=PET_SIZE_MAX).contains(&size) {
        return Err(format!(
            "PET_SIZE_OUT_OF_RANGE: pet size percent must be within {PET_SIZE_MIN}..={PET_SIZE_MAX}"
        ));
    }
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.pet_size = Some(size);
    });
    transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .revision += 1;
    // 窗口尺寸由 pet WebView（知道当前资源真实画布比例）在收到状态事件后实时设置；
    // Rust 不再绕开前端重复 set_size，避免内置鲸鱼（16:9）与自定义图集比例不一致时被
    // 两处高度交替重设，造成大小变更时上下闪烁（issue #308）。DPI 变化仍由 Rust 的
    // ScaleFactorChanged 分支按当前宠物比例重设。
    let status = status_from_setting(&updated);
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 将 DSH 会话原始数据推送到独立桌宠 WebView，不在桌面端构造宠物专用结构。
#[tauri::command]
pub fn push_pet_session(app: AppHandle, action: String, session: Value) -> Result<(), String> {
    let action = action.trim();
    if !matches!(action, "create" | "update" | "remove") {
        return Err("PET_SESSION_ACTION_INVALID: action must be create/update/remove".to_string());
    }
    let id = session
        .get("id")
        .or_else(|| session.get("sessionId"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "PET_SESSION_ID_INVALID: raw session must include id".to_string())?;
    let event = match action {
        "create" => "session:create",
        "update" => "session:update",
        "remove" => "session:remove",
        _ => unreachable!("session action was validated above"),
    };
    app.emit_to(pet_window::PET_WINDOW_LABEL, event, session)
        .map_err(|error| format!("PET_SESSION_PUSH_FAILED: failed to emit session {id}: {error}"))
}

/// DSH 宿主会话增量 SSE 流路径（与 packages/dsh-tauri-pet/src/index.ts 的
/// SESSION_STREAM_PATH 保持一致）。
const SESSION_STREAM_PATH: &str = "/api/dsh-pet/session-stream";

/// 会话增量「动作 → 桌宠窗口事件名」映射（与 push_pet_session 共用）。
fn session_event_of(action: &str) -> Option<&'static str> {
    match action {
        "create" => Some("session:create"),
        "update" => Some("session:update"),
        "remove" => Some("session:remove"),
        _ => None,
    }
}

/// 直接把「动作 + 展示载荷」推给桌宠窗口（返回是否成功，仅用于 debug 日志）。
fn emit_pet_session(app: &AppHandle, action: &str, payload: &Value) {
    let Some(event) = session_event_of(action) else { return; };
    let _ = app.emit_to(pet_window::PET_WINDOW_LABEL, event, payload.clone());
}

/// 消费宿主会话增量 SSE 流：读取 `http://127.0.0.1:<port>/api/dsh-pet/session-stream`，
/// 每个 `data:` 帧（`{"action":...,"payload":...}`）解析后经 emit_to 直达桌宠 WebView。
///
/// 方案 1（host → rust → pet）：Rust 不再依赖 iframe 的 invoke 桥转发（#396 根因），
/// 而是作为宿主流的消费者。流中断（宿主未就绪/重启）时退避重连，幂等可恢复。
async fn consume_pet_session_stream(app: &AppHandle, url: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(5))
        .read_timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    // SSE: data: 行累积，遇空行派发一帧；': keepalive' 注释帧忽略。
    let mut pending_data: Vec<String> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|&byte| byte == b'\n') {
            let line_bytes: Vec<u8> = buffer.drain(..=position).collect();
            let line = String::from_utf8_lossy(&line_bytes[..line_bytes.len() - 1]).into_owned();
            let trimmed = line.trim();
            if let Some(data) = trimmed.strip_prefix("data:") {
                pending_data.push(data.trim().to_string());
            }
            else if trimmed.is_empty() {
                if !pending_data.is_empty() {
                    let frame: Value = serde_json::from_str(&pending_data.join("\n"))
                        .map_err(|error| error.to_string())?;
                    let action = frame
                        .get("action")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let payload = frame.get("payload").cloned().unwrap_or(Value::Null);
                    emit_pet_session(app, &action, &payload);
                    pending_data.clear();
                }
            }
            // 其余（'：' 开头的注释帧等）忽略。
        }
    }
    Ok(())
}

/// 会话增量流消费任务的句柄：桌宠停用/隐藏时 abort，宿主侧 SSE 客户端随连接
/// 关闭归零（宿主插件据此注销 `session/event` 监听）。
fn pet_stream_handle() -> &'static Mutex<Option<tauri::async_runtime::JoinHandle<()>>> {
    static HANDLE: OnceLock<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> = OnceLock::new();
    HANDLE.get_or_init(|| Mutex::new(None))
}

/// 是否需要订阅宿主会话增量流：桌宠已启用且窗口可见。
///
/// 临时隐藏（`hide_pet`）同样视为无消费者——窗口不渲染时转发毫无意义，停掉
/// 订阅即让宿主的热路径与逐会话累计态一并短路。
pub fn pet_stream_wanted(app: &AppHandle) -> bool {
    let status = status_from_setting(&config::get_store_dat_setting(app));
    status.enabled && status.visible
}

/// 按「是否有消费者」启停「宿主会话增量 SSE」消费任务（见
/// [`consume_pet_session_stream`]），幂等：启用且无活动任务才 spawn；停用时
/// abort 任务，连接立即关闭。
///
/// 调用点：应用 setup、`set_pet_enabled` / `show_pet` / `hide_pet`。桌宠关闭或
/// 隐藏后 Rust 不再是宿主流的消费者，宿主侧随即不再为桌宠做任何转发。
pub fn sync_pet_session_stream(app: &AppHandle, wanted: bool) {
    let slot = pet_stream_handle();
    let mut handle = slot.lock().unwrap_or_else(|error| error.into_inner());
    if !wanted {
        if let Some(task) = handle.take() {
            task.abort();
            log::info!("[pet-stream] host session stream stopped (pet disabled or hidden)");
        }
        return;
    }
    if handle
        .as_ref()
        .is_some_and(|task| !task.inner().is_finished())
    {
        return;
    }
    let app = app.clone();
    *handle = Some(tauri::async_runtime::spawn(async move {
        loop {
            if !crate::service::workflow::has_owned_process() {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            let setting = config::get_store_dat_setting(&app);
            let url = format!("http://127.0.0.1:{}{}", setting.port, SESSION_STREAM_PATH);
            match consume_pet_session_stream(&app, &url).await {
                Ok(()) => {
                    log::info!("[pet-stream] host session stream ended; reconnecting in 2s");
                }
                Err(error) => {
                    log::warn!("[pet-stream] host session stream error: {error}; reconnecting in 2s");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }));
}

/// 按物理像素增量移动桌宠窗口，限制在可见显示器并保存最终位置。
///
/// 缩放（`pet://status` 收到新 pet_size）后由 pet WebView 调用 `move_pet_window(0, 0)`
/// 把放大后的窗口夹回可见屏幕，避免右侧/底部被推出屏幕。
#[tauri::command]
pub fn move_pet_window(app: AppHandle, delta_x: i32, delta_y: i32) -> Result<(), String> {
    pet_window::move_pet_window(&app, delta_x, delta_y)
}

/// 显示桌宠窗口；只允许已永久启用的桌宠恢复显示。
#[tauri::command]
pub fn show_pet(app: AppHandle) -> Result<PetStatus, String> {
    let setting = config::get_store_dat_setting(&app);
    if !setting.pet_enabled {
        return Err("PET_DISABLED: pet window is not enabled".to_string());
    }
    set_pet_enabled(app, true)
}

/// 临时隐藏桌宠窗口，不改变永久 enabled；重启后已启用宠物重新显示。
#[tauri::command]
pub fn hide_pet(app: AppHandle) -> Result<PetStatus, String> {
    pet_window::set_pet_window_visible(&app, false)?;
    transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .begin_render(false);
    // 隐藏 = 无人渲染：停掉宿主会话流订阅，宿主侧热路径整条短路。
    sync_pet_session_stream(&app, false);
    let status = status_from_setting(&config::get_store_dat_setting(&app));
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 仅接受宠物 WebView 的真实媒体加载结果，拒绝 iframe 伪造激活状态。
#[tauri::command]
pub fn report_pet_render(
    app: AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    render_id: u64,
    error: Option<String>,
) -> Result<(), String> {
    if window.label() != pet_window::PET_WINDOW_LABEL {
        return Err(
            "PET_RENDER_SOURCE_INVALID: only the pet window may report media status".to_string(),
        );
    }
    let setting = config::get_store_dat_setting(&app);
    if !setting.pet_enabled
        || normalize_active_pet(setting.active_pet.as_deref()).as_deref() != Some(id.as_str())
    {
        return Ok(());
    }
    let error = error.map(|error| error.chars().take(2000).collect::<String>());
    let mut transient = transient_state()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if !transient.report(render_id, error.clone()) {
        return Ok(());
    }
    if let Some(error) = error {
        log::error!("[pet] {id}: {error}");
        let _ = pet_window::set_pet_window_visible(&app, false);
    }
    let status = status_from_state(&setting, &transient);
    drop(transient);
    sync_pet_session_stream(&app, status.enabled && status.visible);
    emit_pet_status(&app, &status);
    Ok(())
}

/// pet 窗口点击穿透开关；返回实际生效的穿透态，前端据此对齐本地 optimistic 状态。
///
/// # 为什么不直接用 `setIgnoreCursorEvents`（issue #437）
///
/// Linux 下 tao 处理 `CursorIgnoreEvents(true)` 时对 GtkWindow 的底层 GdkWindow
/// 直接 `unwrap()`（tao 0.35.3 event_loop.rs:457，截至 0.37.0 上游仍未修复），
/// 窗口从未显示（未 realize，GdkWindow 不存在）即 panic；panic 发生在 GTK
/// 事件循环回调里无法回卷 → SIGABRT，整个桌面端崩溃。而本应用在 setup 阶段
/// 总会预创建隐藏的 pet 窗口（`desktop::pet::init_pet_window`，全新安装默认
/// 不启用桌宠则永远不 show），其 webview 仍会加载 pet.html 并在收到首个全局
/// 鼠标事件时请求穿透——这正是 v0.11.0 初始化阶段必崩的路径。
///
/// 因此所有穿透切换必须经由此命令：窗口不可见（GTK 未 map，必然未 realize）
/// 时吞掉 `true` 请求并返回未生效；`false`（恢复接收事件）在 tao 走无 unwrap
/// 的分支，始终安全转发。GTK 窗口 hide 只 unmap 不 unrealize，首次 show 之后
/// GdkWindow 持续存在，故「可见 ⇒ 转发安全」。
#[tauri::command]
pub fn set_pet_ignore_cursor_events(window: WebviewWindow, ignore: bool) -> Result<bool, String> {
    if window.label() != pet_window::PET_WINDOW_LABEL {
        return Err(
            "PET_WINDOW_LABEL_MISMATCH: this command is restricted to the pet window".to_string(),
        );
    }
    if ignore {
        let visible = window
            .is_visible()
            .map_err(|error| format!("PET_WINDOW_STATE_FAILED: {error}"))?;
        if !visible {
            // 隐藏窗口的穿透无意义：吞掉并上报「未生效」，避免 tao 在未
            // realize 窗口上的 unwrap panic（issue #437）。
            return Ok(false);
        }
    }
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|error| format!("PET_CURSOR_IGNORE_FAILED: {error}"))?;
    Ok(ignore)
}

/// 宠物只使用 `$DSH_HOME/pets`，不读取其他应用的资源目录。
fn pets_dir(app: &AppHandle, source: PetSource) -> Result<PathBuf, String> {
    match source {
        PetSource::Chat => Ok(config::get_dsh_data_path(app).join("pets")),
    }
}

fn valid_manifest_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_')
}

fn validate_manifest_id(id: &str) -> Result<(), String> {
    if valid_manifest_id(id) {
        Ok(())
    } else {
        Err("PET_ID_INVALID: manifest id must be 1..=64 ascii letters/digits/-/_".to_string())
    }
}

fn qualified_id(source: PetSource, manifest_id: &str) -> String {
    format!("{}:{manifest_id}", source.as_str())
}

fn parse_qualified_id(id: &str) -> Result<(PetSource, &str), String> {
    let (source, manifest_id) = id
        .split_once(':')
        .ok_or_else(|| "PET_ID_INVALID: filesystem pet id must be source-qualified".to_string())?;
    let source = PetSource::parse(source)?;
    validate_manifest_id(manifest_id)?;
    Ok((source, manifest_id))
}

/// 已移除的默认宠物不能重新成为隐式选择。
fn validate_active_pet_id(id: &str) -> Result<(), String> {
    if id == REMOVED_PRESET_PET_ID {
        return Err("PET_PRESET_REMOVED: this preset is no longer provided".to_string());
    }
    if crate::bridge::preset_pet::safe_preset_id(id) {
        return Ok(());
    }
    parse_qualified_id(id).map(|_| ())
}

/// 路径只允许普通相对组件；显式拒绝反斜杠和冒号，以便 Unix 上的校验结果也能
/// 覆盖 Windows 的目录分隔符、盘符与 NTFS ADS 语义。
fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.contains('\0') || value.contains('\\') || value.contains(':') {
        return Err("PET_PATH_INVALID: path must be a portable relative path".to_string());
    }
    let mut result = PathBuf::new();
    for component in Path::new(value).components() {
        match component {
            Component::Normal(part) if !part.is_empty() => result.push(part),
            _ => {
                return Err(
                    "PET_PATH_INVALID: path must not be absolute or contain traversal".to_string(),
                )
            }
        }
    }
    if result.as_os_str().is_empty() {
        return Err("PET_PATH_INVALID: path must not be empty".to_string());
    }
    Ok(result)
}

/// 限量读取文件，避免列表缩略图和渲染接口把异常大文件塞进 IPC。
fn read_bounded_file(path: &Path, limit: u64, prefix: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("{prefix}: failed to read {}: {error}", path.display()))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("{prefix}: failed to read {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("{prefix}: {} is not a file", path.display()));
    }
    if metadata.len() > limit {
        return Err(format!(
            "{prefix}: {} exceeds the {limit} byte limit",
            path.display()
        ));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    file.take(limit.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| format!("{prefix}: failed to read {}: {error}", path.display()))?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "{prefix}: {} exceeds the {limit} byte limit",
            path.display()
        ));
    }
    Ok(bytes)
}

fn parse_manifest_bytes(bytes: &[u8]) -> Result<PetManifest, String> {
    let manifest: PetManifest = serde_json::from_slice(bytes)
        .map_err(|error| format!("PET_MANIFEST_INVALID: invalid pet.json: {error}"))?;
    validate_manifest_id(&manifest.id)?;
    if !matches!(manifest.sprite_version_number, None | Some(1 | 2)) {
        return Err(
            "PET_SPRITE_VERSION_UNSUPPORTED: spriteVersionNumber must be 1 or 2".to_string(),
        );
    }
    safe_relative_path(&manifest.spritesheet_path)?;
    Ok(manifest)
}

fn read_manifest(directory: &Path) -> Result<PetManifest, String> {
    let bytes = read_bounded_file(
        &directory.join("pet.json"),
        PET_MANIFEST_MAX_BYTES,
        "PET_MANIFEST_READ_FAILED",
    )?;
    parse_manifest_bytes(&bytes)
}

/// 跟随符号链接后仍必须留在宠物目录中；导入包本身则会更早直接拒绝链接条目。
fn contained_file(directory: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = safe_relative_path(relative)?;
    let root = directory.canonicalize().map_err(|error| {
        format!(
            "PET_ASSET_READ_FAILED: failed to resolve {}: {error}",
            directory.display()
        )
    })?;
    let candidate = directory
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("PET_ASSET_READ_FAILED: failed to resolve asset: {error}"))?;
    if !candidate.starts_with(&root) {
        return Err("PET_PATH_INVALID: spritesheetPath escapes the pet directory".to_string());
    }
    Ok(candidate)
}

fn spritesheet_dimensions(bytes: &[u8]) -> Result<(&'static str, u32, u32), String> {
    let (mime, width, height) = if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        if &bytes[12..16] != b"IHDR" {
            return Err("PET_ASSET_FORMAT_INVALID: PNG is missing IHDR".to_string());
        }
        (
            "image/png",
            u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
            u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
        )
    } else if bytes.len() >= 30 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        let chunk = &bytes[12..16];
        let (width, height) = match chunk {
            b"VP8X" if bytes.len() >= 30 => (
                1 + u32::from(bytes[24])
                    + (u32::from(bytes[25]) << 8)
                    + (u32::from(bytes[26]) << 16),
                1 + u32::from(bytes[27])
                    + (u32::from(bytes[28]) << 8)
                    + (u32::from(bytes[29]) << 16),
            ),
            b"VP8L" if bytes.len() >= 25 && bytes[20] == 0x2f => (
                1 + u32::from(bytes[21]) + ((u32::from(bytes[22]) & 0x3f) << 8),
                1 + (u32::from(bytes[22]) >> 6)
                    + (u32::from(bytes[23]) << 2)
                    + ((u32::from(bytes[24]) & 0x0f) << 10),
            ),
            b"VP8 " if bytes.len() >= 30 && bytes[23..26] == [0x9d, 0x01, 0x2a] => (
                u32::from(u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff),
                u32::from(u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff),
            ),
            _ => {
                return Err(
                    "PET_ASSET_FORMAT_INVALID: unsupported or malformed WebP header".to_string(),
                )
            }
        };
        ("image/webp", width, height)
    } else {
        return Err("PET_ASSET_FORMAT_INVALID: spritesheet must be PNG or WebP".to_string());
    };

    let pixels = u64::from(width) * u64::from(height);
    if width == 0
        || height == 0
        || width > PET_SPRITESHEET_MAX_DIMENSION
        || height > PET_SPRITESHEET_MAX_DIMENSION
        || pixels > PET_SPRITESHEET_MAX_PIXELS
    {
        return Err(format!(
            "PET_ASSET_DIMENSIONS_INVALID: spritesheet dimensions exceed {PET_SPRITESHEET_MAX_DIMENSION}px or {PET_SPRITESHEET_MAX_PIXELS} pixels"
        ));
    }
    if width % u32::from(PET_SPRITE_COLUMNS) != 0 || (height % 9 != 0 && height % 11 != 0) {
        return Err(format!(
            "PET_ASSET_DIMENSIONS_INVALID: spritesheet must have {PET_SPRITE_COLUMNS} columns and 9 or 11 rows"
        ));
    }
    Ok((mime, width, height))
}

fn sprite_layout(version: Option<u8>, height: u32) -> Result<(u8, u8), String> {
    // 兼容旧 Harness 已接受的无标记 v2 包；标准 v1 图集高度不能被 11 整除。
    let version = version.unwrap_or(if height % 11 == 0 { 2 } else { 1 });
    let rows = match version {
        1 => 9,
        2 => 11,
        _ => return Err("PET_SPRITE_VERSION_UNSUPPORTED: expected v1 or v2".to_string()),
    };
    if height == 0 || height % u32::from(rows) != 0 {
        return Err(format!(
            "PET_ASSET_DIMENSIONS_INVALID: v{version} spritesheet must have {rows} rows"
        ));
    }
    Ok((version, rows))
}

fn load_sprite_asset(
    directory: &Path,
    source: PetSource,
    manifest: &PetManifest,
) -> Result<PetAsset, String> {
    let path = contained_file(directory, &manifest.spritesheet_path)?;
    let bytes = read_bounded_file(&path, PET_SPRITESHEET_MAX_BYTES, "PET_ASSET_READ_FAILED")?;
    let (mime, _, height) = spritesheet_dimensions(&bytes)?;
    let (sprite_version_number, rows) = sprite_layout(manifest.sprite_version_number, height)?;
    Ok(PetAsset {
        id: qualified_id(source, &manifest.id),
        spritesheet: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
        sprite_version_number,
        columns: PET_SPRITE_COLUMNS,
        rows,
    })
}

fn manifest_to_list_item(
    source: PetSource,
    directory: &Path,
    manifest: PetManifest,
) -> PetListItem {
    let name = manifest
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&manifest.id)
        .to_string();
    let (thumbnail, sprite_rows) = match load_sprite_asset(directory, source, &manifest) {
        Ok(asset) => (Some(asset.spritesheet), Some(asset.rows)),
        Err(_) => (None, None),
    };
    let description = manifest
        .description
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    PetListItem {
        id: qualified_id(source, &manifest.id),
        name,
        description,
        thumbnail,
        sprite_rows,
        source: source.as_str().to_string(),
    }
}

fn immediate_pet_directories(root: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "PET_LIST_FAILED: failed to read {}: {error}",
                root.display()
            ))
        }
    };
    let mut directories = Vec::new();
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() && !file_type.is_symlink() {
            directories.push(entry.path());
        }
    }
    directories.sort();
    Ok(directories)
}

/// 列出指定来源目录中的清单。损坏的单个宠物会被忽略，不阻断其余可用宠物。
#[tauri::command]
pub fn list_pets(app: AppHandle, source: String) -> Result<Vec<PetListItem>, String> {
    let source = PetSource::parse(source.trim())?;
    let root = pets_dir(&app, source)?;
    let mut items = Vec::new();
    let mut ids = HashSet::new();
    for directory in immediate_pet_directories(&root)? {
        let Ok(manifest) = read_manifest(&directory) else {
            continue;
        };
        let id = qualified_id(source, &manifest.id);
        if ids.insert(id) {
            items.push(manifest_to_list_item(source, &directory, manifest));
        }
    }
    items.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(items)
}

fn find_pet_directory(
    root: &Path,
    manifest_id: &str,
) -> Result<Option<(PathBuf, PetManifest)>, String> {
    for directory in immediate_pet_directories(root)? {
        let Ok(manifest) = read_manifest(&directory) else {
            continue;
        };
        if manifest.id == manifest_id {
            return Ok(Some((directory, manifest)));
        }
    }
    Ok(None)
}

/// 按来源限定 id 读取真实精灵图。
#[tauri::command]
pub fn get_pet_asset(app: AppHandle, id: String) -> Result<PetAsset, String> {
    let id = id.trim();
    let (source, manifest_id) = parse_qualified_id(id)?;
    let root = pets_dir(&app, source)?;
    let (directory, manifest) = find_pet_directory(&root, manifest_id)?.ok_or_else(|| {
        format!(
            "PET_NOT_FOUND: pet {} was not found",
            qualified_id(source, manifest_id)
        )
    })?;
    load_sprite_asset(&directory, source, &manifest)
}

fn pet_import_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// zip 条目额外拒绝符号链接与其他特殊 Unix 文件类型。
fn safe_archive_entry(name: &str, unix_mode: Option<u32>) -> Result<PathBuf, String> {
    if let Some(mode) = unix_mode {
        let file_type = mode & 0o170000;
        if file_type != 0 && file_type != 0o040000 && file_type != 0o100000 {
            return Err("PET_ARCHIVE_LINK_FORBIDDEN: archive links are not allowed".to_string());
        }
    }
    safe_relative_path(name.trim_end_matches('/'))
}

fn archive_root_prefix(paths: &[(PathBuf, bool)]) -> Result<Option<PathBuf>, String> {
    let manifests = paths
        .iter()
        .filter(|(path, is_dir)| {
            !is_dir && path.file_name().and_then(|value| value.to_str()) == Some("pet.json")
        })
        .map(|(path, _)| path)
        .collect::<Vec<_>>();
    if manifests.len() != 1 {
        return Err(
            "PET_ARCHIVE_LAYOUT_INVALID: archive must contain exactly one pet.json".to_string(),
        );
    }
    let manifest = manifests[0];
    if manifest == Path::new("pet.json") {
        return Ok(None);
    }
    let prefix = manifest.parent().filter(|parent| parent.components().count() == 1)
        .ok_or_else(|| {
            "PET_ARCHIVE_LAYOUT_INVALID: archive must contain pet.json at root or in one wrapper directory"
                .to_string()
        })?
        .to_path_buf();
    if paths
        .iter()
        .any(|(path, _)| path != &prefix && !path.starts_with(&prefix))
    {
        return Err(
            "PET_ARCHIVE_LAYOUT_INVALID: archive must have exactly one supported root".to_string(),
        );
    }
    Ok(Some(prefix))
}

/// 流式复制时按实际解压字节数截断，不能只信任 zip 中声明的文件大小。
fn copy_archive_entry<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    total: &mut u64,
    limit: u64,
) -> Result<(), String> {
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let remaining = limit.saturating_sub(*total);
        if remaining == 0 {
            let mut probe = [0_u8; 1];
            let count = reader.read(&mut probe).map_err(|error| {
                format!("PET_ARCHIVE_EXTRACT_FAILED: failed to read archive entry: {error}")
            })?;
            if count == 0 {
                return Ok(());
            }
            return Err(format!(
                "PET_ARCHIVE_TOO_LARGE: uncompressed files must not exceed {limit} bytes"
            ));
        }
        let chunk_limit = usize::try_from(remaining)
            .unwrap_or(usize::MAX)
            .min(buffer.len());
        let count = reader.read(&mut buffer[..chunk_limit]).map_err(|error| {
            format!("PET_ARCHIVE_EXTRACT_FAILED: failed to read archive entry: {error}")
        })?;
        if count == 0 {
            return Ok(());
        }
        writer.write_all(&buffer[..count]).map_err(|error| {
            format!("PET_ARCHIVE_EXTRACT_FAILED: failed to write archive entry: {error}")
        })?;
        *total = total
            .checked_add(count as u64)
            .ok_or_else(|| "PET_ARCHIVE_TOO_LARGE: uncompressed size overflow".to_string())?;
    }
}

/// 两遍处理 zip：先完整验证路径、类型和声明大小，再向 staging 写入。
fn extract_pet_archive(bytes: &[u8], staging: &Path) -> Result<PetManifest, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("PET_ARCHIVE_INVALID: failed to open zip: {error}"))?;
    if archive.len() == 0 || archive.len() > PET_PACKAGE_MAX_ENTRIES {
        return Err(format!(
            "PET_ARCHIVE_ENTRY_LIMIT: archive must contain 1..={PET_PACKAGE_MAX_ENTRIES} entries"
        ));
    }

    let mut paths = Vec::with_capacity(archive.len());
    let mut declared_total = 0_u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("PET_ARCHIVE_INVALID: failed to read entry: {error}"))?;
        let path = safe_archive_entry(file.name(), file.unix_mode())?;
        let is_dir = file.is_dir();
        if !is_dir {
            declared_total = declared_total
                .checked_add(file.size())
                .ok_or_else(|| "PET_ARCHIVE_TOO_LARGE: uncompressed size overflow".to_string())?;
            if declared_total > PET_PACKAGE_MAX_UNCOMPRESSED_BYTES {
                return Err(format!(
                    "PET_ARCHIVE_TOO_LARGE: uncompressed files must not exceed {PET_PACKAGE_MAX_UNCOMPRESSED_BYTES} bytes"
                ));
            }
        }
        paths.push((path, is_dir));
    }
    let prefix = archive_root_prefix(&paths)?;

    fs::create_dir(staging).map_err(|error| {
        format!("PET_IMPORT_STAGING_FAILED: failed to create staging directory: {error}")
    })?;
    let mut outputs = HashSet::new();
    let mut actual_total = 0_u64;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("PET_ARCHIVE_INVALID: failed to read entry: {error}"))?;
        let path = safe_archive_entry(file.name(), file.unix_mode())?;
        let relative = match prefix.as_deref() {
            Some(wrapper) if path == wrapper => continue,
            Some(wrapper) => path.strip_prefix(wrapper).map_err(|_| {
                "PET_ARCHIVE_LAYOUT_INVALID: entry is outside wrapper directory".to_string()
            })?,
            None => path.as_path(),
        };
        if relative.as_os_str().is_empty() || !outputs.insert(relative.to_path_buf()) {
            if relative.as_os_str().is_empty() {
                continue;
            }
            return Err("PET_ARCHIVE_DUPLICATE_ENTRY: duplicate output path".to_string());
        }
        let output_path = staging.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| {
                format!("PET_ARCHIVE_EXTRACT_FAILED: failed to create directory: {error}")
            })?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("PET_ARCHIVE_EXTRACT_FAILED: failed to create directory: {error}")
            })?;
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
            .map_err(|error| {
                format!("PET_ARCHIVE_EXTRACT_FAILED: failed to create file: {error}")
            })?;
        copy_archive_entry(
            &mut file,
            &mut output,
            &mut actual_total,
            PET_PACKAGE_MAX_UNCOMPRESSED_BYTES,
        )?;
    }

    let manifest = read_manifest(staging)?;
    load_sprite_asset(staging, PetSource::Chat, &manifest)?;
    Ok(manifest)
}

fn unique_staging_path(staging_root: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    staging_root.join(format!("import-{}-{nonce}", std::process::id()))
}

fn prepare_staging_root(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("PET_DIR_FAILED: failed to create pets directory: {error}"))?;
    let staging_root = root.join(".staging");
    match fs::symlink_metadata(&staging_root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            Err("PET_IMPORT_STAGING_FAILED: .staging must be a real directory".to_string())
        }
        Ok(_) => Ok(staging_root),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&staging_root).map_err(|error| {
                format!("PET_IMPORT_STAGING_FAILED: failed to create staging directory: {error}")
            })?;
            Ok(staging_root)
        }
        Err(error) => Err(format!(
            "PET_IMPORT_STAGING_FAILED: failed to inspect staging directory: {error}"
        )),
    }
}

fn path_exists_including_symlink(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "PET_IMPORT_COMMIT_FAILED: failed to inspect target: {error}"
        )),
    }
}

/// 导入资源包默认使用应用自己的宠物目录。
#[tauri::command]
pub fn import_pet(
    app: AppHandle,
    name: String,
    data: String,
    source: Option<String>,
) -> Result<PetListItem, String> {
    // 前端协议仍携带文件名，但文件名可能含 Unicode/空格且属于不可信展示数据。
    let _ = name;
    let encoded_limit = PET_PACKAGE_MAX_BYTES.div_ceil(3) * 4;
    if data.len() > encoded_limit {
        return Err(format!(
            "PET_PACKAGE_TOO_LARGE: pet package must not exceed {PET_PACKAGE_MAX_BYTES} compressed bytes"
        ));
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|error| format!("PET_PACKAGE_DECODE_FAILED: invalid base64 payload: {error}"))?;
    if bytes.len() > PET_PACKAGE_MAX_BYTES {
        return Err(format!(
            "PET_PACKAGE_TOO_LARGE: pet package must not exceed {PET_PACKAGE_MAX_BYTES} compressed bytes"
        ));
    }

    let source = PetSource::parse(source.as_deref().unwrap_or("chat"))?;
    let root = pets_dir(&app, source)?;
    install_pet_archive(&root, source, &bytes, None)
}

pub(super) fn install_harness_pet(
    app: &AppHandle,
    id: &str,
    bytes: &[u8],
) -> Result<PetListItem, String> {
    validate_manifest_id(id)?;
    let root = pets_dir(app, PetSource::Chat)?;
    install_pet_archive(&root, PetSource::Chat, bytes, Some(id))
}

pub(super) fn installed_harness_pet_ids(app: &AppHandle) -> Result<HashSet<String>, String> {
    let root = pets_dir(app, PetSource::Chat)?;
    Ok(immediate_pet_directories(&root)?
        .into_iter()
        .filter_map(|directory| read_manifest(&directory).ok().map(|manifest| manifest.id))
        .collect())
}

fn install_pet_archive(
    root: &Path,
    source: PetSource,
    bytes: &[u8],
    expected_id: Option<&str>,
) -> Result<PetListItem, String> {
    if bytes.len() > PET_PACKAGE_MAX_BYTES {
        return Err("PET_PACKAGE_TOO_LARGE: pet package exceeds 32 MiB".to_string());
    }
    let _guard = pet_import_lock()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let staging_root = prepare_staging_root(root)?;
    let staging = unique_staging_path(&staging_root);
    let result = (|| {
        let manifest = extract_pet_archive(bytes, &staging)?;
        if expected_id.is_some_and(|id| id != manifest.id) {
            return Err(
                "PET_PACKAGE_ID_MISMATCH: archive does not match the catalog pet".to_string(),
            );
        }
        let target = root.join(&manifest.id);
        if path_exists_including_symlink(&target)? {
            return Err(format!(
                "PET_ALREADY_IMPORTED: pet target {} already exists",
                manifest.id
            ));
        }
        if let Some((existing, _)) = find_pet_directory(root, &manifest.id)? {
            return Err(format!(
                "PET_ALREADY_IMPORTED: pet id {} already exists at {}",
                manifest.id,
                existing.display()
            ));
        }
        fs::rename(&staging, &target)
            .map_err(|error| format!("PET_IMPORT_COMMIT_FAILED: failed to install pet: {error}"))?;
        Ok(manifest_to_list_item(source, &target, manifest))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::FileOptions;
    use zip::CompressionMethod;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            Self(
                std::env::temp_dir().join(format!("dsh-pet-{name}-{}-{nonce}", std::process::id())),
            )
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn build_archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = FileOptions::default().compression_method(CompressionMethod::Stored);
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn valid_test_webp() -> Vec<u8> {
        let mut bytes = b"RIFF\x16\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x00\x00\x00\x00".to_vec();
        bytes.extend_from_slice(&[87, 0, 0, 87, 0, 0]);
        bytes
    }

    #[test]
    #[ignore = "需要 prepare-pet-market 生成的真实资源包"]
    fn market_original_and_adapted_packages_install() {
        let fixtures = PathBuf::from(
            std::env::var_os("WANGLAB_PET_FIXTURES")
                .expect("WANGLAB_PET_FIXTURES 必须指向 release-packages"),
        );
        let market = fixtures.join("site-staging-pets/downloads/wanglab-harness/pets");
        let catalog: crate::bridge::pet_market::MarketCatalog =
            serde_json::from_slice(&fs::read(market.join("catalog.json")).unwrap()).unwrap();
        assert_eq!(
            catalog
                .pets
                .iter()
                .map(|pet| pet.id.as_str())
                .collect::<Vec<_>>(),
            ["codenono", "nimbus", "kimlet-hover-clap", "muskie"]
        );
        let root = TestDirectory::new("market-real-packages");
        for pet in catalog.pets {
            let original = fs::read(
                fixtures
                    .join("pet-market-source")
                    .join(&pet.id)
                    .join("original.zip"),
            )
            .unwrap();
            let original_item = install_pet_archive(
                &root.0.join("original"),
                PetSource::Chat,
                &original,
                Some(&pet.id),
            )
            .unwrap();
            assert_eq!(original_item.id, format!("chat:{}", pet.id));
            assert_eq!(original_item.sprite_rows, Some(9));
            let url = reqwest::Url::parse(&pet.archive_url).unwrap();
            let relative = url
                .path()
                .strip_prefix("/downloads/wanglab-harness/pets/")
                .unwrap();
            let adapted = fs::read(market.join(relative)).unwrap();
            let adapted_item = install_pet_archive(
                &root.0.join("adapted"),
                PetSource::Chat,
                &adapted,
                Some(&pet.id),
            )
            .unwrap();
            assert_eq!(adapted_item, original_item);
            let installed = root.0.join("adapted").join(&pet.id);
            assert!(fs::read_to_string(installed.join("LICENSE"))
                .unwrap()
                .contains(&pet.author.name));
            assert!(fs::read_to_string(installed.join("ATTRIBUTION.md"))
                .unwrap()
                .contains(&pet.source_url));
        }
    }

    #[test]
    fn active_pet_has_no_implicit_default() {
        assert_eq!(normalize_active_pet(None), None);
        assert_eq!(normalize_active_pet(Some("   ")), None);
        assert_eq!(normalize_active_pet(Some(REMOVED_PRESET_PET_ID)), None);
        assert_eq!(
            normalize_active_pet(Some(" chat:custom-pet ")).as_deref(),
            Some("chat:custom-pet"),
            "有效 id 应只去除首尾空白"
        );
        assert_eq!(
            normalize_active_pet(Some("custom-preset")).as_deref(),
            Some("custom-preset")
        );
        for legacy_or_invalid in [
            "codex:custom_pet",
            "other:pet",
            "chat:../pet",
            "bad id",
            "x/y",
        ] {
            assert_eq!(
                normalize_active_pet(Some(legacy_or_invalid)),
                None,
                "非法 id {legacy_or_invalid} 不能成为默认选择"
            );
        }
    }

    #[test]
    fn upgrade_clears_removed_sources_but_preserves_application_pets() {
        for id in [
            None,
            Some(""),
            Some(REMOVED_PRESET_PET_ID),
            Some("codex:custom"),
        ] {
            let mut setting = config::Setting {
                active_pet: id.map(str::to_string),
                pet_enabled: true,
                pet_size: Some(125.0),
                ..Default::default()
            };
            migrate_pet_selection(&mut setting);
            assert_eq!(setting.active_pet, None);
            assert!(!setting.pet_enabled);
            assert_eq!(setting.pet_size, Some(125.0));
        }
        for enabled in [false, true] {
            let mut setting = config::Setting {
                active_pet: Some("chat:custom".to_string()),
                pet_enabled: enabled,
                ..Default::default()
            };
            migrate_pet_selection(&mut setting);
            assert_eq!(setting.active_pet.as_deref(), Some("chat:custom"));
            assert_eq!(setting.pet_enabled, enabled);
        }
    }

    #[test]
    fn status_requires_selection_enablement_and_render_confirmation() {
        let mut transient = PetTransientState::default();
        transient.begin_render(true);
        let mut setting = config::Setting {
            pet_enabled: true,
            ..Default::default()
        };
        let status = status_from_state(&setting, &transient);
        assert!(!status.enabled && !status.visible && !status.ready);
        assert_eq!(status.active_pet, None);
        setting.active_pet = Some("chat:custom".to_string());
        let status = status_from_state(&setting, &transient);
        assert!(status.enabled && status.visible);
        assert!(!status.ready, "显示透明窗口不代表媒体已加载");
        assert!(transient.report(transient.render_id, None));
        assert!(status_from_state(&setting, &transient).ready);
        setting.pet_enabled = false;
        let status = status_from_state(&setting, &transient);
        assert!(!status.enabled && !status.visible && !status.ready);
    }

    #[test]
    fn render_failures_hide_the_pet_and_old_reports_cannot_reactivate_it() {
        let mut transient = PetTransientState::default();
        transient.begin_render(true);
        let first_render = transient.render_id;
        assert!(transient.report(first_render, None));
        assert!(transient.ready);
        assert!(transient.report(first_render, Some("PET_MEDIA_DECODE_FAILED".to_string())));
        assert!(!transient.visible && !transient.ready);
        assert!(!transient.report(first_render, None));
        transient.begin_render(true);
        assert!(!transient.ready && transient.error.is_none());
        assert!(!transient.report(first_render, Some("late error".to_string())));
        assert!(transient.report(transient.render_id, None));
        transient.begin_render(false);
        assert!(!transient.report(transient.render_id, None));
    }

    #[test]
    fn status_never_reports_visible_when_disabled() {
        let setting = config::Setting {
            pet_enabled: false,
            ..Default::default()
        };
        let status = status_from_setting(&setting);
        assert!(!status.enabled);
        assert!(!status.visible);
        assert!(!status.ready);
        assert_eq!(status.active_pet, None);
    }

    #[test]
    fn manifest_parsing_preserves_unspecified_version_and_qualifies_source_ids() {
        let manifest = parse_manifest_bytes(
            br#"{"id":"blue_whale","displayName":"Blue Whale","description":"Chat pet","spritesheetPath":"art/pet.webp"}"#,
        )
        .unwrap();
        assert_eq!(manifest.sprite_version_number, None);
        assert_eq!(
            qualified_id(PetSource::Chat, &manifest.id),
            "chat:blue_whale"
        );
    }

    #[test]
    fn manifest_rejects_invalid_ids_and_unknown_sprite_versions() {
        let invalid_id =
            parse_manifest_bytes(br#"{"id":"../pet","spritesheetPath":"spritesheet.webp"}"#)
                .unwrap_err();
        assert!(invalid_id.starts_with("PET_ID_INVALID:"));
        let unknown = parse_manifest_bytes(
            br#"{"id":"future","spriteVersionNumber":3,"spritesheetPath":"spritesheet.webp"}"#,
        )
        .unwrap_err();
        assert!(unknown.starts_with("PET_SPRITE_VERSION_UNSUPPORTED:"));
    }

    #[test]
    fn qualified_ids_require_known_source_and_safe_manifest_id() {
        assert_eq!(
            parse_qualified_id("chat:pet_1").unwrap(),
            (PetSource::Chat, "pet_1")
        );
        assert!(parse_qualified_id("pet_1")
            .unwrap_err()
            .starts_with("PET_ID_INVALID:"));
        assert!(parse_qualified_id("other:pet_1")
            .unwrap_err()
            .starts_with("PET_SOURCE_INVALID:"));
        assert!(parse_qualified_id("codex:pet_1")
            .unwrap_err()
            .starts_with("PET_SOURCE_INVALID:"));
        assert!(parse_qualified_id("chat:../pet")
            .unwrap_err()
            .starts_with("PET_ID_INVALID:"));
    }

    #[test]
    fn archive_paths_reject_traversal_absolute_windows_and_links() {
        for path in [
            "../escape",
            "/absolute",
            "a/../../escape",
            "C:/escape",
            "..\\escape",
        ] {
            assert!(
                safe_archive_entry(path, Some(0o100644)).is_err(),
                "应拒绝 {path}"
            );
        }
        assert!(safe_archive_entry("pet/spritesheet.webp", Some(0o100644)).is_ok());
        assert!(safe_archive_entry("pet/link", Some(0o120777))
            .unwrap_err()
            .starts_with("PET_ARCHIVE_LINK_FORBIDDEN:"));
    }

    #[test]
    fn archive_layout_accepts_root_or_one_wrapper_only() {
        let root = vec![
            (PathBuf::from("pet.json"), false),
            (PathBuf::from("spritesheet.webp"), false),
        ];
        assert_eq!(archive_root_prefix(&root).unwrap(), None);

        let wrapped = vec![
            (PathBuf::from("my-pet"), true),
            (PathBuf::from("my-pet/pet.json"), false),
            (PathBuf::from("my-pet/spritesheet.webp"), false),
        ];
        assert_eq!(
            archive_root_prefix(&wrapped).unwrap(),
            Some(PathBuf::from("my-pet"))
        );

        let mixed = vec![
            (PathBuf::from("my-pet/pet.json"), false),
            (PathBuf::from("outside.txt"), false),
        ];
        assert!(archive_root_prefix(&mixed)
            .unwrap_err()
            .starts_with("PET_ARCHIVE_LAYOUT_INVALID:"));

        let duplicate_manifests = vec![
            (PathBuf::from("pet.json"), false),
            (PathBuf::from("wrapper/pet.json"), false),
        ];
        assert!(archive_root_prefix(&duplicate_manifests)
            .unwrap_err()
            .starts_with("PET_ARCHIVE_LAYOUT_INVALID:"));
    }

    #[test]
    fn bounded_copy_stops_before_writing_past_total_limit() {
        let mut reader = Cursor::new(vec![7_u8; 6]);
        let mut output = Vec::new();
        let mut total = 3_u64;
        let error = copy_archive_entry(&mut reader, &mut output, &mut total, 8).unwrap_err();
        assert!(error.starts_with("PET_ARCHIVE_TOO_LARGE:"));
        assert_eq!(total, 8);
        assert_eq!(output.len(), 5, "不得把超过总上限的字节写入 staging");
    }

    #[test]
    fn spritesheet_dimensions_require_supported_grid_and_bounds() {
        let valid = valid_test_webp();
        assert_eq!(
            spritesheet_dimensions(&valid).unwrap(),
            ("image/webp", 88, 88)
        );

        let mut invalid_grid = valid.clone();
        invalid_grid[24] = 86;
        assert!(spritesheet_dimensions(&invalid_grid)
            .unwrap_err()
            .starts_with("PET_ASSET_DIMENSIONS_INVALID:"));

        let mut oversized = valid;
        oversized[24..27].copy_from_slice(&[0xff, 0xff, 0x00]);
        assert!(spritesheet_dimensions(&oversized)
            .unwrap_err()
            .starts_with("PET_ASSET_DIMENSIONS_INVALID:"));
    }

    #[test]
    fn sprite_layout_accepts_legacy_and_current_packs_without_reinterpreting_explicit_versions() {
        assert_eq!(sprite_layout(None, 1872).unwrap(), (1, 9));
        assert_eq!(sprite_layout(Some(1), 1872).unwrap(), (1, 9));
        assert_eq!(sprite_layout(None, 2288).unwrap(), (2, 11));
        assert_eq!(sprite_layout(Some(2), 2288).unwrap(), (2, 11));
        assert!(sprite_layout(Some(2), 1872).is_err());
        assert!(sprite_layout(Some(1), 2288).is_err());
        assert!(sprite_layout(None, 0).is_err());
    }

    #[test]
    fn market_install_checks_identity_and_preserves_existing_files() {
        let manifest =
            br#"{"id":"sample","spriteVersionNumber":2,"spritesheetPath":"spritesheet.webp"}"#;
        let webp = valid_test_webp();
        let archive = build_archive(&[("pet.json", manifest), ("spritesheet.webp", &webp)]);
        let root = TestDirectory::new("market-install");
        assert!(
            install_pet_archive(&root.0, PetSource::Chat, &archive, Some("different"))
                .unwrap_err()
                .starts_with("PET_PACKAGE_ID_MISMATCH:")
        );
        assert!(!root.0.join("sample").exists());
        let item = install_pet_archive(&root.0, PetSource::Chat, &archive, Some("sample")).unwrap();
        assert_eq!(item.id, "chat:sample");
        assert_eq!(item.source, "chat");
        fs::write(root.0.join("sample/user-notes.txt"), b"keep").unwrap();
        assert!(
            install_pet_archive(&root.0, PetSource::Chat, &archive, Some("sample"))
                .unwrap_err()
                .starts_with("PET_ALREADY_IMPORTED:")
        );
        assert_eq!(
            fs::read(root.0.join("sample/user-notes.txt")).unwrap(),
            b"keep"
        );
        assert_eq!(fs::read_dir(root.0.join(".staging")).unwrap().count(), 0);
    }

    #[test]
    fn extraction_accepts_wrapper_and_validates_manifest_asset() {
        let manifest = br#"{"id":"wrapped_pet","displayName":"Wrapped","spritesheetPath":"art/spritesheet.webp"}"#;
        let webp = valid_test_webp();
        let archive = build_archive(&[
            ("wrapper/pet.json", manifest),
            ("wrapper/art/spritesheet.webp", &webp),
        ]);
        let directory = TestDirectory::new("valid-wrapper");
        let parsed = extract_pet_archive(&archive, &directory.0).unwrap();
        assert_eq!(parsed.id, "wrapped_pet");
        assert_eq!(fs::read(directory.0.join("pet.json")).unwrap(), manifest);
        assert_eq!(
            fs::read(directory.0.join("art/spritesheet.webp")).unwrap(),
            webp
        );
        assert!(!directory.0.join("wrapper").exists());
    }

    #[test]
    fn extraction_rejects_traversal_before_creating_staging() {
        let archive = build_archive(&[
            (
                "pet.json",
                br#"{"id":"safe_pet","spritesheetPath":"spritesheet.webp"}"#,
            ),
            ("../escape", b"bad"),
            ("spritesheet.webp", b"RIFF\x04\x00\x00\x00WEBP"),
        ]);
        let directory = TestDirectory::new("traversal");
        let error = extract_pet_archive(&archive, &directory.0).unwrap_err();
        assert!(error.starts_with("PET_PATH_INVALID:"));
        assert!(!directory.0.exists(), "完整校验失败前不得创建 staging");
    }
}
