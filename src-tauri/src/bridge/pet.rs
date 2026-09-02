//! bridge/pet.rs — 桌宠（外置透明宠物窗口）的 Tauri 命令出口。
//!
//! 这些命令被 dsh 容器（iframe 内的 dsh 界面 / dsh-tauri-pet 插件）经 invoke
//! 桥调用（壳层桥监听模块 `src/hooks/use-iframe-invoke.ts` 把 iframe 的
//! postMessage invoke 转发到 `@tauri-apps/api/core` 的 `invoke`）。所有状态
//! 读写统一落在 `config::setting`（持久化）与 `desktop::pet`（窗口）。
//! 错误遵循仓库约定：`Result<_, String>`，Err 以大写协议前缀开头（如
//! `PET_SIZE_OUT_OF_RANGE:`）。
//!
//! 实时性：一切会改变状态（开关/选择/大小）的命令都通过 `pet://status` 事件
//! 把最新 PetStatus 推给 pet 窗口——设置页拖动条拖动中实时调整宠物大小就是
//! 走这条通道；pet 窗口的 get_pet_status 轮询仅作兜底。

use crate::config;
use crate::desktop::pet as pet_window;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// 宠物大小百分比合法区间（精灵图缩放 50%–200%，与插件设置页滑条一致）。
pub const PET_SIZE_MIN: f64 = pet_window::PET_SIZE_MIN_PERCENT;
pub const PET_SIZE_MAX: f64 = pet_window::PET_SIZE_MAX_PERCENT;

/// 导入桌宠资源包的大小上限（32 MiB）。
const PET_PACKAGE_MAX_BYTES: usize = 32 * 1024 * 1024;

/// 状态变化推送给 pet 窗口的事件名（实时同步大小/选择；轮询兜底）。
pub const PET_STATUS_EVENT: &str = "pet://status";

/// 桌宠当前状态（设置页与插件读取）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PetStatus {
    /// 桌宠是否启用（决定是否显示外置宠物窗口）。
    pub enabled: bool,
    /// 当前选中的桌宠模型包名；None/空 = 未选择（默认宠）。
    pub active_pet: Option<String>,
    /// 宠物大小百分比（50–200，100 = 精灵图原始尺寸）；None = 未设置（默认 100）。
    pub pet_size: Option<f64>,
}

/// 已导入的桌宠资源包条目（应用数据目录 `pets/` 下的 .zip）。
#[derive(Debug, Clone, Serialize)]
pub struct PetListItem {
    /// 资源包标志（文件名去 .zip；同时作为 active_pet 的取值）。
    pub id: String,
    /// 展示名（与 id 相同：导入即以文件名命名）。
    pub name: String,
}

/// 把最新状态推送给 pet 窗口（拖动条实时调整大小的主要通道）。
fn emit_pet_status(app: &AppHandle, status: &PetStatus) {
    let _ = app.emit_to(pet_window::PET_WINDOW_LABEL, PET_STATUS_EVENT, status.clone());
}

/// 查询桌宠当前状态（启用与否 + 当前选择的宠物模型 + 显示大小百分比）。
#[tauri::command]
pub fn get_pet_status(app: AppHandle) -> PetStatus {
    let setting = config::get_store_dat_setting(&app);
    PetStatus {
        enabled: setting.pet_enabled,
        active_pet: setting.active_pet.clone(),
        pet_size: setting.pet_size,
    }
}

/// 启用/停用桌宠：改变设置并同步外置宠物窗口的显示状态。
#[tauri::command]
pub fn set_pet_enabled(app: AppHandle, enabled: bool) -> Result<PetStatus, String> {
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.pet_enabled = enabled;
    });

    // 无论启用还是停用都同步窗口（停用隐藏、启用创建+显示）。
    pet_window::sync_pet_window(&app);

    let status = PetStatus {
        enabled: updated.pet_enabled,
        active_pet: updated.active_pet.clone(),
        pet_size: updated.pet_size,
    };
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 选择桌宠模型包（设置页「选择宠物」），并持久化 active_pet。
///
/// `id` 为模型包标志（内置宠 id 或用户导入的 .zip 包名）。
#[tauri::command]
pub fn set_active_pet(app: AppHandle, id: String) -> Result<PetStatus, String> {
    let id = id.trim().to_string();
    if id.is_empty() {
        return Err("PET_ID_EMPTY: active pet id must not be empty".to_string());
    }
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.active_pet = Some(id);
    });

    let status = PetStatus {
        enabled: updated.pet_enabled,
        active_pet: updated.active_pet.clone(),
        pet_size: updated.pet_size,
    };
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 设置宠物大小百分比（设置页滑条，50–200），并实时同步窗口尺寸。
///
/// 命令在拖动过程中被高频调用：先持久化，再立刻重设已存在窗口的尺寸，并
/// 经 `pet://status` 事件推给 pet 窗口缩放精灵图；超出合法区间直接拒绝。
#[tauri::command]
pub fn set_pet_size(app: AppHandle, size: f64) -> Result<PetStatus, String> {
    if !size.is_finite() || size < PET_SIZE_MIN || size > PET_SIZE_MAX {
        return Err(format!(
            "PET_SIZE_OUT_OF_RANGE: pet size percent must be within {PET_SIZE_MIN}..={PET_SIZE_MAX}"
        ));
    }
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.pet_size = Some(size);
    });

    pet_window::apply_pet_size(&app);

    let status = PetStatus {
        enabled: updated.pet_enabled,
        active_pet: updated.active_pet.clone(),
        pet_size: updated.pet_size,
    };
    emit_pet_status(&app, &status);
    Ok(status)
}

/// 显示桌宠窗口（仅当已启用时有效）。
#[tauri::command]
pub fn show_pet(app: AppHandle) -> Result<(), String> {
    if !config::get_store_dat_setting(&app).pet_enabled {
        return Err("PET_DISABLED: pet window is not enabled".to_string());
    }
    pet_window::sync_pet_window(&app);
    Ok(())
}

/// 隐藏桌宠窗口（不改动 pet_enabled 设置）。
#[tauri::command]
pub fn hide_pet(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(pet_window::PET_WINDOW_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

/// 已导入桌宠资源包目录（`app_data_dir()/pets`，不存在则创建）。
fn pets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("PET_DIR_FAILED: failed to resolve app data dir: {error}"))?
        .join("pets");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("PET_DIR_FAILED: failed to create pets dir: {error}"))?;
    Ok(dir)
}

/// 列出已导入的桌宠资源包（`pets/` 下的 .zip，按包名排序）。
///
/// 目录不存在/读取失败时返回空列表（导入面板展示空态而不是报错）。
#[tauri::command]
pub fn list_pets(app: AppHandle) -> Vec<PetListItem> {
    let Ok(dir) = pets_dir(&app) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut items: Vec<PetListItem> = entries
        .flatten()
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
        })
        .filter_map(|entry| {
            let id = entry.path().file_stem()?.to_string_lossy().to_string();
            Some(PetListItem { name: id.clone(), id })
        })
        .collect();
    items.sort_by(|a, b| a.id.cmp(&b.id));
    items
}

/// 导入桌宠资源包（设置页 Codex 页签：.zip 文件 base64 上传后落盘）。
///
/// 包名取自文件名（去 .zip），仅允许 ASCII 字母/数字/`-`/`_` 且 ≤ 64 字符，
/// 防路径注入；同名包已存在时拒绝（PET_ALREADY_IMPORTED）。
#[tauri::command]
pub fn import_pet(app: AppHandle, name: String, data: String) -> Result<PetListItem, String> {
    let name = name.trim().trim_end_matches(".zip").trim().to_string();
    let valid = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(
            "PET_NAME_INVALID: pet name must be 1..=64 ascii letters/digits/-/_".to_string(),
        );
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|error| format!("PET_PACKAGE_DECODE_FAILED: invalid base64 payload: {error}"))?;
    if bytes.len() > PET_PACKAGE_MAX_BYTES {
        return Err(format!(
            "PET_PACKAGE_TOO_LARGE: pet package must not exceed {PET_PACKAGE_MAX_BYTES} bytes"
        ));
    }
    let dir = pets_dir(&app)?;
    let target = dir.join(format!("{name}.zip"));
    if target.exists() {
        return Err(format!("PET_ALREADY_IMPORTED: pet package {name} already exists"));
    }
    std::fs::write(&target, bytes).map_err(|error| {
        format!("PET_PACKAGE_WRITE_FAILED: failed to write pet package: {error}")
    })?;
    Ok(PetListItem { id: name.clone(), name })
}
