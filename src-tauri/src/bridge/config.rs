//! 应用全局配置、系统偏好与 CLI Link 集成。
//!
//! 桌面端自身设置（端口/自启/语言/主题/侧边栏）的读写，以及命令行集成的
//! 状态查询；命令行集成开关的落库顺序与 CLI Link 的文件/PATH 操作绑定。

use crate::config;
use crate::service::cli;
use tauri::AppHandle;

/// 前端自动持久化只负责界面偏好，不能写回旧的内核、档案和安装状态。
#[derive(serde::Deserialize)]
pub struct FrontendPreferences {
    zoom_factor: Option<f64>,
    language: Option<String>,
}

impl FrontendPreferences {
    fn apply(self, setting: &mut config::Setting) {
        if let Some(zoom_factor) = self.zoom_factor {
            setting.zoom_factor = zoom_factor;
        }
        if let Some(language) = self.language {
            setting.language = language;
        }
    }
}

#[tauri::command]
pub fn save_frontend_preferences(
    app_handle: AppHandle,
    preferences: FrontendPreferences,
) -> config::Setting {
    config::update_store_dat_setting(&app_handle, |setting| preferences.apply(setting))
}

/// 当前桌面端配置
#[tauri::command]
pub async fn get_app_config(app_handle: AppHandle) -> Result<config::Setting, String> {
    Ok(config::get_store_dat_setting(&app_handle))
}

/// 更新桌面端配置
///
/// `close_action` 对应前端的 camelCase `closeAction`，命中关闭按钮时的行为
/// （`tray` = 隐藏到托盘，`quit` = 退出应用）；取值收敛由 `update_store_dat_setting`
/// 内的 `normalize_close_action` 统一负责，此处不做二次校验以免白名单漂移。
///
/// 备份字段（backup_retention_count / backup_include_credentials）由前端
/// 设置页写入，归一化由 `normalize_backup_fields` 统一负责。
#[tauri::command]
pub async fn update_app_config(
    app_handle: AppHandle,
    port: Option<u16>,
    auto_start: Option<bool>,
    cli_link_enabled: Option<bool>,
    close_action: Option<String>,
    backup_retention_count: Option<u32>,
    backup_include_credentials: Option<bool>,
) -> Result<config::Setting, String> {
    if let Some(port) = port {
        if port == 0 {
            return Err("port must be a positive number".to_string());
        }
    }
    // 命令行集成：先执行文件系统/PATH 操作，成功后再持久化开关，
    // 失败时配置保持不变，避免"开关已开但 shim 未生成"的不一致状态。
    if let Some(enabled) = cli_link_enabled {
        if enabled {
            cli::ensure(&app_handle)?;
        } else {
            cli::remove(&app_handle)?;
        }
    }
    let setting = config::update_store_dat_setting(&app_handle, |setting| {
        if let Some(port) = port {
            setting.port = port;
            // 记住用户手动选择的端口：自动避让递增后仍能回落回用户值，而不是
            // 一路顶高（issue #91，见 workflow::launch 的端口自愈逻辑）
            setting.manual_port = Some(port);
        }
        if let Some(auto_start) = auto_start {
            setting.auto_start = auto_start;
        }
        if let Some(enabled) = cli_link_enabled {
            setting.cli_link_enabled = enabled;
        }
        if let Some(action) = close_action {
            setting.close_action = action;
        }
        if let Some(count) = backup_retention_count {
            setting.backup_retention_count = count;
        }
        if let Some(include) = backup_include_credentials {
            setting.backup_include_credentials = include;
        }
    });
    Ok(setting)
}

/// 查询桌面应用是否已注册为随当前用户登录启动。
///
/// 系统启动项才是真实来源：用户可能在 Windows 任务管理器或其它平台的系统设置中
/// 改动它，因此不能用应用 store 中的布尔值代替实际状态。
#[tauri::command]
pub fn get_launch_on_login(app_handle: AppHandle) -> Result<bool, String> {
    crate::desktop::autostart::is_enabled(&app_handle)
}

/// 启用或移除桌面应用的系统登录启动项，并复查系统中的最终状态。
#[tauri::command]
pub fn set_launch_on_login(app_handle: AppHandle, enabled: bool) -> Result<bool, String> {
    crate::desktop::autostart::set_enabled(&app_handle, enabled)
}

/// 命令行集成状态（shim 文件与 PATH 注册情况）
#[tauri::command]
pub fn get_cli_link_status(app_handle: AppHandle) -> Result<cli::CliLinkStatus, String> {
    Ok(cli::get_status(&app_handle))
}

/// 保存界面语言偏好
#[tauri::command]
pub fn set_language(app_handle: AppHandle, lang: String) {
    config::update_store_dat_setting(&app_handle, |setting| {
        setting.language = lang.clone();
    });
    config::i18n::set_language(match lang.as_str() {
        "en" | "en-US" => config::i18n::Lang::En,
        _ => config::i18n::Lang::Zh,
    });
    #[cfg(target_os = "macos")]
    if let Err(error) = crate::desktop::builder::install_macos_menu(&app_handle) {
        log::warn!("[menu] failed to refresh macOS menu language: {error}");
    }
}

/// 切换侧边栏（布局状态保存在前端，保留该命令以对齐参考实现）
#[tauri::command]
pub async fn toggle_sidebar() -> Result<bool, String> {
    Ok(true)
}

/// 当前 dsh 主题偏好（light/dark/system），用于让桌面外壳跟随内嵌页面主题
#[tauri::command]
pub fn get_dsh_theme(app_handle: AppHandle) -> config::DshTheme {
    config::get_dsh_theme(&app_handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_frontend_preferences_cannot_overwrite_installed_core_or_profile() {
        let mut setting = config::Setting {
            installed: true,
            active_core: Some("app".into()),
            dsh_pkg_tag: Some(config::WANGLAB_DSH_TAG.into()),
            dsh_pkg_commit: Some(config::WANGLAB_DSH_COMMIT.into()),
            active_profile: "research".into(),
            pet_enabled: true,
            active_pet: Some("chat:nimbus".into()),
            ..Default::default()
        };
        let mut expected = setting.clone();
        expected.zoom_factor = 1.2;
        expected.language = "en-US".into();
        let stale: FrontendPreferences = serde_json::from_value(serde_json::json!({
            "zoom_factor": 1.2,
            "language": "en-US",
            "installed": false,
            "active_core": "local",
            "dsh_pkg_tag": "dsh-0.1.2-rc.1-wanglab032",
            "dsh_pkg_commit": "old-core",
            "active_profile": "web",
            "pet_enabled": false,
            "active_pet": null,
            "port": 3080
        }))
        .unwrap();

        stale.apply(&mut setting);
        assert_eq!(setting, expected);
    }

    #[test]
    fn absent_frontend_preferences_leave_existing_settings_unchanged() {
        let mut setting = config::Setting::default();
        let expected = setting.clone();
        let preferences: FrontendPreferences =
            serde_json::from_value(serde_json::json!({ "language": null })).unwrap();
        preferences.apply(&mut setting);
        assert_eq!(setting, expected);
    }
}
