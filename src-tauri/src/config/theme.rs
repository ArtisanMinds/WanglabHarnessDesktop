use std::fs;
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "macos")]
use tauri::Manager;
use tauri::{AppHandle, Emitter};

use super::runtime::get_dsh_data_path;

/// dsh 主题偏好（对应 `$DSH_HOME/settings.yaml` 的 `ui-theme.preference`）
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DshTheme {
    Dark,
    Light,
    System,
}

/// 未设置过主题偏好时的回退值：跟随系统外观。
///
/// 首次进入（`settings.yaml` 不存在）或偏好值缺失/非法时都走这里；回退成固定
/// 深色会让「跟随系统」的默认体验失效（浅色系统上启动即深色）。
const DEFAULT_THEME: DshTheme = DshTheme::System;

static LAST_EMITTED: OnceLock<Mutex<Option<DshTheme>>> = OnceLock::new();

/// 读取 dsh 主题偏好；settings.yaml 缺失或解析失败时回退为跟随系统
pub fn get_dsh_theme(app_handle: &AppHandle) -> DshTheme {
    let settings_path = get_dsh_data_path(app_handle).join("settings.yaml");
    let content = match fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(err) => {
            log::debug!("failed to read dsh settings.yaml: {}", err);
            return DEFAULT_THEME;
        }
    };
    parse_theme_preference(&content).unwrap_or(DEFAULT_THEME)
}

/// 从 settings.yaml 文本中提取 `ui-theme.preference`（light/dark/system）
fn parse_theme_preference(content: &str) -> Option<DshTheme> {
    let mut in_ui_theme = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("ui-theme:") {
            in_ui_theme = true;
            continue;
        }
        if !in_ui_theme {
            continue;
        }
        // ui-theme 段结束（遇到无缩进的新顶层 key）
        if !line.starts_with(' ') && !line.starts_with('\t') {
            return None;
        }
        if !trimmed.is_empty() && !trimmed.starts_with('#') {
            if let Some(value) = trimmed.strip_prefix("preference:") {
                return match value.trim() {
                    "light" => Some(DshTheme::Light),
                    "dark" => Some(DshTheme::Dark),
                    "system" => Some(DshTheme::System),
                    _ => None,
                };
            }
        }
    }
    None
}

/// 把 dsh 主题偏好同步为主窗口的原生外观（仅 macOS）。
///
/// macOS 上窗口保留了原生标题栏（`decorations(true)` + `Overlay` + `hidden_title`），
/// 其材质与交通灯底色跟随「系统外观」，而内嵌 dsh 页面的亮/暗由前端
/// `html[data-theme]` 独立控制；两者不联动就会出现「内容已切亮色、顶部标题栏仍
/// 是暗色」的割裂（issue #93）。这里把偏好直接落到原生外观：`system` → 跟随系统，
/// `light` / `dark` → 强制指定，让原生 chrome 与 dsh 页面始终一致。
///
/// 非 macOS 平台关闭了窗口 decoration、整窗皆为前端 `data-theme`，无原生 chrome
/// 可同步，无需（也无从）调用。
#[cfg(target_os = "macos")]
pub fn apply_window_theme(app_handle: &AppHandle, theme: DshTheme) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::debug!("apply_window_theme: main window not built yet");
        return;
    };
    let appearance = match theme {
        DshTheme::System => None,
        DshTheme::Light => Some(tauri::Theme::Light),
        DshTheme::Dark => Some(tauri::Theme::Dark),
    };
    if let Err(err) = window.set_theme(appearance) {
        log::warn!("[theme] failed to sync native window appearance: {err}");
    }
}

/// 主题偏好变化时向前端推送 `dsh-theme-updated` 事件（仅在变化时触发一次）。
/// 变化时同步 macOS 原生窗口外观，与前端 `data-theme` 保持同源。
pub fn check_and_emit_theme(app_handle: &AppHandle) {
    let theme = get_dsh_theme(app_handle);
    let mut last = LAST_EMITTED
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap();
    if *last == Some(theme) {
        return;
    }
    *last = Some(theme);
    log::debug!("dsh theme preference changed: {:?}", theme);
    let _ = app_handle.emit("dsh-theme-updated", &theme);
    #[cfg(target_os = "macos")]
    apply_window_theme(app_handle, theme);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 首次进入（`settings.yaml` 不存在）与偏好值非法时都回退「跟随系统」；
    /// 回退固定深色会让浅色系统上的默认外观失效（首次进入即深色）。
    #[test]
    fn default_theme_follows_system() {
        assert_eq!(DEFAULT_THEME, DshTheme::System);
    }

    #[test]
    fn parses_known_preference_values() {
        let cases = [
            ("ui-theme:\n  preference: dark\n", DshTheme::Dark),
            ("ui-theme:\n  preference: light\n", DshTheme::Light),
            ("ui-theme:\n  preference: system\n", DshTheme::System),
        ];
        for (content, expected) in cases {
            assert_eq!(parse_theme_preference(content), Some(expected), "content={content:?}");
        }
    }

    /// 未知取值与整段缺失都返回 `None`，由调用方回退 `DEFAULT_THEME`。
    #[test]
    fn rejects_unknown_and_missing_preference() {
        assert_eq!(parse_theme_preference("ui-theme:\n  preference: blue\n"), None);
        assert_eq!(parse_theme_preference("ui-theme:\n  density: compact\n"), None);
        assert_eq!(parse_theme_preference("editor:\n  fontSize: 12\n"), None);
    }
}
