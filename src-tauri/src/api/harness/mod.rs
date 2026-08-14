//! Harness lifecycle: runtime setup, package install, launch, and shutdown.

pub mod constants;
pub mod error;
pub mod installer;
pub mod progress;
pub mod state;

pub use constants::*;
pub use error::{DshError, DshResult};
pub use installer::{DshInstaller, DshManifest, ReleaseAsset};
pub use progress::{ProgressPayload, ProgressTracker};
pub use state::{
    construct_dsh_envs, runtime_info, AppConfig, DshHealthChecker, RuntimeInfo,
};

use crate::services::{downloader, manager};
use crate::i18n;
use std::fs;
use tauri::{AppHandle, Manager, Runtime, Window};

/// Check whether the harness package is already installed.
pub fn is_installed<R: Runtime>(app: &AppHandle<R>) -> bool {
    DshInstaller::new(app).map(|i| i.is_installed()).unwrap_or(false)
}

/// Set up the bundled Node.js runtime (download + verify).
pub async fn setup_runtime<R: Runtime>(window: Window<R>) -> DshResult<()> {
    let app_handle = window.app_handle();
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| DshError::Path(e.to_string()))?;
    let runtime_dir = app_data_dir.join("runtime");

    let node_path = manager::get_node_binary_path(runtime_dir.clone());
    let compatible = node_path.exists() && manager::is_runtime_compatible(&runtime_dir);
    if compatible {
        println!("[dsh] compatible Node runtime already present, skipping download");
        return Ok(());
    }

    if runtime_dir.exists() {
        println!("[dsh] outdated runtime found, forcing reinstall");
        let _ = fs::remove_dir_all(&runtime_dir);
    }

    let urls = manager::get_node_download_urls().map_err(DshError::Installation)?;
    let mut last_error: Option<String> = None;
    for url in urls {
        println!("[dsh] downloading Node runtime from {url}");
        match downloader::download_file(window.clone(), vec![url.clone()], runtime_dir.clone(), "runtime").await {
            Ok(()) => {
                if manager::is_runtime_compatible(&runtime_dir) {
                    println!("[dsh] Node runtime ready");
                    return Ok(());
                }
                last_error = Some(i18n::t("runtime.incompatible"));
            }
            Err(err) => {
                eprintln!("[dsh] runtime download failed ({url}): {err}");
                last_error = Some(err);
            }
        }
    }

    Err(DshError::Installation(last_error.unwrap_or_else(|| i18n::t("runtime.unsupported_platform"))))
}

/// Download and install the packaged harness distribution.
pub async fn setup_harness<R: Runtime>(window: Window<R>) -> DshResult<()> {
    install_dependencies(window).await
}

/// One-shot install flow with phase-tracked progress, mirroring the reference
/// installer: 4 phases (download + extract for the Node runtime, download +
/// extract for the harness package). Already-installed phases are skipped.
pub async fn install_dependencies<R: Runtime>(window: Window<R>) -> DshResult<()> {
    let app_handle = window.app_handle();
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| DshError::Path(e.to_string()))?;

    let mut tracker = ProgressTracker::new(&window, 4);

    // --- Phase 1+2: Node.js runtime -------------------------------------
    let runtime_dir = app_data_dir.join("runtime");
    let node_path = manager::get_node_binary_path(runtime_dir.clone());
    if node_path.exists() && manager::is_runtime_compatible(&runtime_dir) {
        println!("[install] Node runtime already compatible, skipping");
        tracker.skip_phases(2);
    } else {
        if runtime_dir.exists() {
            let _ = fs::remove_dir_all(&runtime_dir);
        }

        tracker.start_phase(
            "download",
            &format!("{} {}", i18n::t("install.downloading"), i18n::t("runtime.title")),
        );
        let urls = manager::get_node_download_urls().map_err(DshError::Installation)?;
        let buffer = progress::tracked_download(&tracker, &urls)
            .await
            .map_err(DshError::Installation)?;
        tracker.end_phase();

        tracker.start_phase(
            "extract",
            &format!("{} {}", i18n::t("install.extracting"), i18n::t("runtime.title")),
        );
        downloader::extract_archive_to_dir(&buffer, &runtime_dir)
            .map_err(DshError::Installation)?;
        if !manager::is_runtime_compatible(&runtime_dir) {
            return Err(DshError::Installation(i18n::t("runtime.incompatible")));
        }
        tracker.end_phase();
    }

    // --- Phase 3+4: harness package --------------------------------------
    let installer = DshInstaller::new(&app_handle)?;
    if installer.is_installed() {
        println!("[install] harness package already installed, skipping");
        tracker.skip_phases(2);
    } else {
        tracker.start_phase(
            "download",
            &format!("{} {}", i18n::t("install.downloading"), i18n::t("harness.title")),
        );
        installer.download_package(&tracker).await?;
        tracker.end_phase();

        tracker.start_phase(
            "extract",
            &format!("{} {}", i18n::t("install.extracting"), i18n::t("harness.title")),
        );
        installer.clean_and_extract()?;
        if !installer.is_installed() {
            return Err(DshError::Installation(i18n::t("harness.core_not_found")));
        }
        tracker.end_phase();
    }

    tracker.update(100.0, i18n::t("install.done"), "install complete".to_string());
    println!(
        "[install] dependencies ready (dsh {})",
        installer.dsh_version().unwrap_or_else(|| "?".into())
    );
    Ok(())
}

/// Launch the local `dsh web` service.
pub fn launch_harness<R: Runtime>(app: &AppHandle<R>) -> DshResult<()> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DshError::Path(e.to_string()))?;
    let installer = DshInstaller::new(app)?;

    let runtime_dir = app_data_dir.join("runtime");
    let node_path = manager::get_node_binary_path(runtime_dir);
    if !node_path.exists() {
        return Err(DshError::Installation(i18n::t("runtime.not_found")));
    }

    let entry_path = installer.entry_path();
    if !entry_path.exists() {
        return Err(DshError::Installation(i18n::t("harness.core_not_found")));
    }

    let config = AppConfig::load(app);
    let envs = construct_dsh_envs(app, config.port)?;
    let log_path = app_data_dir.join("logs").join("dsh-web.log");
    let core_dir = installer.core_dir();

    manager::start_dsh(
        &node_path,
        &entry_path,
        &core_dir,
        envs,
        DSH_SERVICE_HOST,
        config.port,
        &log_path,
    )
    .map_err(DshError::Process)
}

/// Stop the running harness service.
pub fn shutdown_harness() -> DshResult<()> {
    let mut process_manager = manager::PROCESS_MANAGER
        .lock()
        .map_err(|_| DshError::Process(i18n::t("process.manager_poisoned")))?;
    process_manager.kill_child();
    println!("[dsh] service stopped");
    Ok(())
}

/// Health check through the Rust proxy (avoids webview CORS surprises).
pub async fn proxy_health_check(port: u16) -> DshResult<String> {
    DshHealthChecker::check(port).await
}
