//! Tauri commands exposed to the frontend.

use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::api::harness;
use crate::api::utils;
use crate::i18n;

/// Check whether the harness package is installed.
#[tauri::command]
pub async fn is_installed<R: Runtime>(app: AppHandle<R>) -> bool {
    println!("[cmd] is_installed");
    harness::is_installed(&app)
}

/// Set up the bundled Node.js runtime.
#[tauri::command]
pub async fn setup_runtime<R: Runtime>(window: Window<R>) -> Result<(), String> {
    println!("[cmd] setup_runtime");
    harness::setup_runtime(window).await.map_err(|e| e.to_string())
}

/// One-shot install of the Node runtime and the harness package, streaming
/// `install-progress` events to the installer page.
#[tauri::command]
pub async fn install_dependencies<R: Runtime>(window: Window<R>) -> Result<(), String> {
    println!("[cmd] install_dependencies");
    harness::install_dependencies(window).await.map_err(|e| e.to_string())
}

/// Download and install the packaged harness distribution.
#[tauri::command]
pub async fn setup_harness<R: Runtime>(window: Window<R>) -> Result<(), String> {
    println!("[cmd] setup_harness");
    harness::setup_harness(window).await.map_err(|e| e.to_string())
}

/// Launch the local dsh service.
#[tauri::command]
pub async fn launch_harness<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    println!("[cmd] launch_harness");
    harness::launch_harness(&app).map_err(|e| e.to_string())
}

/// Stop the local dsh service.
#[tauri::command]
pub fn shutdown_harness() -> Result<(), String> {
    harness::shutdown_harness().map_err(|e| e.to_string())
}

/// Health check through the Rust proxy.
#[tauri::command]
pub async fn proxy_health_check<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    println!("[cmd] proxy_health_check");
    let port = utils::active_port(&app);
    harness::proxy_health_check(port).await.map_err(|e| e.to_string())
}

/// Runtime/version/diagnostic info for the sidebar.
#[tauri::command]
pub async fn get_runtime_info<R: Runtime>(app: AppHandle<R>) -> Result<harness::RuntimeInfo, String> {
    println!("[cmd] get_runtime_info");
    let config = harness::AppConfig::load(&app);
    Ok(harness::runtime_info(&app, &config))
}

/// Current desktop configuration.
#[tauri::command]
pub async fn get_app_config<R: Runtime>(app: AppHandle<R>) -> Result<harness::AppConfig, String> {
    Ok(harness::AppConfig::load(&app))
}

/// Update desktop configuration.
#[tauri::command]
pub async fn update_app_config<R: Runtime>(
    app: AppHandle<R>,
    port: Option<u16>,
    auto_start: Option<bool>,
) -> Result<harness::AppConfig, String> {
    let mut config = harness::AppConfig::load(&app);
    if let Some(port) = port {
        if port == 0 {
            return Err("port must be a positive number".to_string());
        }
        config.port = port;
    }
    if let Some(auto_start) = auto_start {
        config.auto_start = auto_start;
    }
    config.save(&app).map_err(|e| e.to_string())?;
    Ok(config)
}

/// Open the harness UI in the system browser.
#[tauri::command]
pub async fn open_in_browser<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let url = harness::service_url(utils::active_port(&app));
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Copy the harness URL to the clipboard.
#[tauri::command]
pub async fn copy_service_url<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let url = harness::service_url(utils::active_port(&app));
    app.clipboard().write_text(url).map_err(|e| e.to_string())
}

/// Reveal the app data directory in the system file manager.
#[tauri::command]
pub async fn reveal_data_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let command = if cfg!(windows) {
        std::process::Command::new("explorer")
            .arg(&app_data_dir)
            .spawn()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(&app_data_dir).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(&app_data_dir).spawn()
    };
    command.map_err(|e| format!("{}: {e}", i18n::t("download.failed")))?;
    Ok(())
}

/// Tail the dsh service log file.
#[tauri::command]
pub async fn read_service_logs<R: Runtime>(
    app: AppHandle<R>,
    max_bytes: Option<usize>,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let log_path = app_data_dir.join("logs").join("dsh-web.log");
    if !log_path.exists() {
        return Ok(String::new());
    }

    let content = std::fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    let max_bytes = max_bytes.unwrap_or(64 * 1024);
    if content.len() <= max_bytes {
        Ok(content)
    } else {
        Ok(content[content.len() - max_bytes..].to_string())
    }
}

/// Reset the dsh service log file.
#[tauri::command]
pub async fn clear_service_logs<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let log_path = app_data_dir.join("logs").join("dsh-web.log");
    std::fs::write(&log_path, "").map_err(|e| e.to_string())
}

/// Set the backend language for Rust-side error strings.
#[tauri::command]
pub fn set_language(lang: String) {
    let l = match lang.to_lowercase().as_str() {
        "en" => i18n::Lang::En,
        _ => i18n::Lang::Zh,
    };
    i18n::set_language(l);
}

/// Toggle the sidebar (parity command; layout state lives in the frontend).
#[tauri::command]
pub async fn toggle_sidebar() -> Result<bool, String> {
    Ok(true)
}
