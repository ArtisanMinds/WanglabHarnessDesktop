//! 桌宠外置窗口：独立的透明、置顶、无边框小窗口，用于展示 dsh 会话状态的
//! 动画宠物（桌宠外置化，issue #308）。
//!
//! 设计要点（参考 BongoCat 的多 WebView 桌宠方案）：
//! - 独立窗口 label `pet`，`WebviewUrl::App("pet.html")`，与主窗口（`main`）
//!   并行，由主 webview 监听 dsh-container 的 invoke 桥来操控；
//! - 窗口特性：`transparent + always_on_top + decorations(false) +
//!   skip_taskbar + shadow(false) + accept_first_mouse`，打造覆盖在普通
//!   窗口之上的不抢占焦点的宠物层；
//! - 几何（位置/大小）持久化到独立 store 键 `pet_window_state`，重启恢复，
//!   不与主窗口几何互相污染（主窗口用 `config::window_state`）。
//!
//! 平台说明：
//! - macOS 透明窗口需要 `macOSPrivateApi`（见 tauri.conf.json `app` 段），且
//!   Tauri 的 masking 需 `macos-private-api` Cargo feature，由
//!   `src-tauri/Cargo.toml` 按平台门控开启。这里透明依赖平台原生支持，创建失败
//!   时回退为非透明窗口继续工作。
//! - `always_on_top` 在 Windows 上 Tauri 原生 API 即可保持置顶（BongoCat 为
//!   额外稳定性用 SetWindowPos 循环轮询，本项目暂不做该平台特定加固）。

use crate::config::{self, STORE_PET_WINDOW_STATE_KEY};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    Window,
};
use tauri_plugin_store::StoreExt;

/// 桌宠窗口的 label（Tauri 窗口标识，脚本层与能力配置以此引用）。
pub const PET_WINDOW_LABEL: &str = "pet";
/// 桌宠窗口默认尺寸（逻辑像素），偶数值便于像素对齐的精灵图展示。
pub const PET_WINDOW_WIDTH: f64 = 240.0;
pub const PET_WINDOW_HEIGHT: f64 = 280.0;

/// 持久化的桌宠窗口位置（仅记录位置；大小固定为 PET_WINDOW_* 尺寸不随用户变化）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PetWindowPosition {
    /// 非 None 时恢复物理位置；None 表示用户从未拖动过，走系统默认（居中靠下）。
    pub x: Option<i32>,
    pub y: Option<i32>,
}

fn store_dat_file_name() -> &'static str {
    if cfg!(debug_assertions) {
        config::STORE_DAT_DEV_FILE
    } else {
        config::STORE_DAT_FILE
    }
}

/// 读取上次保存的桌宠窗口位置；无记录时返回默认（None，位置未定）。
pub fn get_pet_window_position<R: Runtime>(app: &AppHandle<R>) -> PetWindowPosition {
    let store = app
        .store(store_dat_file_name())
        .expect("Failed to load store for pet window position");
    let raw = store.get(STORE_PET_WINDOW_STATE_KEY);
    let value = raw.as_ref().and_then(|v| {
        v.as_str()
            .and_then(|s| serde_json::from_str(s).ok())
            .or_else(|| Some(v.clone()))
    });
    value
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// 保存桌宠窗口位置（用户拖动后由 Moved 事件调用）。
pub fn save_pet_window_position<R: Runtime>(app: &AppHandle<R>, position: &PetWindowPosition) {
    let store = app
        .store(store_dat_file_name())
        .expect("Failed to load store for pet window position");
    let serialized =
        serde_json::to_value(position).expect("Failed to serialize pet window position");
    store.set(STORE_PET_WINDOW_STATE_KEY, serialized);
    store.save().expect("Failed to save pet window position");
}

/// 采样当前桌宠窗口位置并保存（窗口 Moved 时由 builder 调用）。
///
/// 接收基础 `Window`（`on_window_event` 回调类型），仅需其外部位与可见性。
pub fn save_pet_window_geometry<R: Runtime>(window: &Window<R>) {
    // 窗口未显示或正在全屏时采样到的可能是瞬态/无意义的位置，跳过。
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let Some(pos) = window.outer_position().ok() else {
        return;
    };
    let app = window.app_handle().clone();
    save_pet_window_position(
        &app,
        &PetWindowPosition {
            x: Some(pos.x),
            y: Some(pos.y),
        },
    );
}

/// 确保桌宠窗口存在并恢复位置。
///
/// 幂等：已注册时直接复用返回；首次调用时创建 `pet` 窗口并恢复上一次保存的
/// 位置（无记录则默认定位在主屏右下角略偏上，避免遮挡主工作区）。
pub fn ensure_pet_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        return Ok(window);
    }
    let app_handle = app.clone();
    // 非 Windows 平台在此前加入注入脚本时再赋值，故需要 mut；Windows 下保持只读。
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, PET_WINDOW_LABEL, WebviewUrl::App("pet.html".into()))
        .title("Deepseek Harness Pet")
        .inner_size(PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .transparent(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .shadow(false)
        .accept_first_mouse(true)
        .visible(false);

    // 非 Windows 平台经 initialization script 让 dsh 容器的桥/兼容注入生效，
    // 与主窗口保持一致（桌宠页同样可能加载共享的前端模块）。
    #[cfg(not(windows))]
    {
        builder = builder
            .initialization_script_for_all_frames(crate::desktop::compat::ABORT_SIGNAL_ANY_SHIM_JS)
            .initialization_script_for_all_frames(crate::desktop::notification::NOTIFICATION_SHIM_JS)
            .initialization_script_for_all_frames(crate::desktop::nav::NAV_SHIM_JS)
            .initialization_script_for_all_frames(crate::desktop::style::IFRAME_STYLES_JS)
            .initialization_script_for_all_frames(crate::desktop::paste::PASTE_SHIM_JS)
            .initialization_script_for_all_frames(crate::desktop::plugin_boot::PLUGIN_BOOT_RELOAD_JS)
            .initialization_script_for_all_frames(crate::desktop::zoom::ZOOM_SHORTCUT_BRIDGE_JS);
    }

    let window = builder.build()?;
    let app_for_pos = app_handle.clone();
    let saved = get_pet_window_position(&app_for_pos);
    if let (Some(x), Some(y)) = (saved.x, saved.y) {
        // 恢复的位置必须落在某个可见屏幕内，否则回退默认定位。
        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
    }
    else {
        place_pet_at_default(&window);
    }
    Ok(window)
}

/// 把桌宠窗口放到主工作区右下角略偏上（主屏内、避开底部任务栏高度）。
fn place_pet_at_default<R: Runtime>(window: &WebviewWindow<R>) {
    let app = window.app_handle();
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return;
    };
    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    // 距屏幕右下角 32px 的物理偏移，尺寸用物理像素计算。
    let w = (PET_WINDOW_WIDTH * monitor.scale_factor()) as i32;
    let h = (PET_WINDOW_HEIGHT * monitor.scale_factor()) as i32;
    let x = mon_pos.x + mon_size.width as i32 - w - 32;
    let y = mon_pos.y + mon_size.height as i32 - h - 96;
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
}

/// 按是否启用把桌宠窗口显示/隐藏。
///
/// - 未启用：隐藏窗口（保留窗口实例，避免反复重建）。
/// - 已启用：确保窗口存在并显示居中到上次位置。
pub fn sync_pet_window<R: Runtime>(app: &AppHandle<R>) {
    let enabled = crate::config::get_store_dat_setting(app).pet_enabled;
    if !enabled {
        if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
            let _ = window.hide();
        }
        return;
    }
    if ensure_pet_window(app).is_ok() {
        if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// 创建桌宠窗口并沿用当前「是否启用」设置（应用启动时调用，幂等）。
pub fn init_pet_window<R: Runtime>(app: &AppHandle<R>) {
    sync_pet_window(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_window_position_serde_roundtrip() {
        let pos = PetWindowPosition {
            x: Some(120),
            y: Some(240),
        };
        let json = serde_json::to_string(&pos).expect("serialize");
        let parsed: PetWindowPosition = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.x, Some(120));
        assert_eq!(parsed.y, Some(240));
    }

    #[test]
    fn pet_window_position_defaults_to_none() {
        // 缺失字段 / 空对象时应回落默认（未定制位置），不能反序列化失败
        let parsed: PetWindowPosition = serde_json::from_str("{}").expect("deserialize");
        assert!(parsed.x.is_none());
        assert!(parsed.y.is_none());

        let default = PetWindowPosition::default();
        assert!(default.x.is_none() && default.y.is_none());
    }
}