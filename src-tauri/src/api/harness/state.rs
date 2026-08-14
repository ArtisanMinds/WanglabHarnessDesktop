//! Env construction, health checks, desktop settings, and runtime info.

use crate::i18n;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

use super::constants::*;
use super::error::{DshError, DshResult};
use super::installer::DshInstaller;

/// Persistent desktop settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub port: u16,
    pub auto_start: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: DSH_SERVICE_PORT.parse().unwrap_or(3080),
            auto_start: true,
        }
    }
}

impl AppConfig {
    fn path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("config").join("config.json")
    }

    pub fn load<R: Runtime>(app: &AppHandle<R>) -> AppConfig {
        let path = Self::path(&app.path().app_data_dir().unwrap_or_default());
        fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    pub fn save<R: Runtime>(&self, app: &AppHandle<R>) -> DshResult<()> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| DshError::Path(e.to_string()))?;
        let path = Self::path(&app_data_dir);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }
}

/// Environment variables passed to the `dsh web` process.
pub fn construct_dsh_envs<R: Runtime>(
    app: &AppHandle<R>,
    port: u16,
) -> DshResult<HashMap<String, String>> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DshError::Path(e.to_string()))?;
    let dsh_home = app_data_dir.join(DSH_HOME_DIR_NAME);
    fs::create_dir_all(&dsh_home)?;

    let mut envs = HashMap::new();
    // Isolate all harness user data inside the desktop app data directory.
    envs.insert("DSH_HOME".to_string(), dsh_home.to_string_lossy().into_owned());
    // Privacy default: disable telemetry unless the user opts in.
    envs.insert("DSH_TELEMETRY_DISABLED".to_string(), "1".to_string());
    envs.insert("NO_COLOR".to_string(), "1".to_string());
    // Port is passed as a CLI flag in manager::start_dsh; keep it here for parity.
    envs.insert("DSH_WEB_PORT".to_string(), port.to_string());
    Ok(envs)
}

/// Health check for the harness web server.
pub struct DshHealthChecker;

impl DshHealthChecker {
    pub async fn check(port: u16) -> DshResult<String> {
        let client = reqwest::Client::builder()
            .timeout(HEALTH_CHECK_TIMEOUT)
            .build()?;

        for endpoint in health_check_endpoints(port) {
            match client.get(&endpoint).send().await {
                Ok(response) => {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    if status.is_success() {
                        return Ok(format!("healthy - {status} - {}", body.chars().take(80).collect::<String>()));
                    }
                }
                Err(err) => {
                    eprintln!("[dsh] health check {endpoint}: {err}");
                }
            }
        }
        Err(DshError::Process(i18n::t("harness.health_unhealthy")))
    }
}

/// Version/diagnostic info surfaced in the sidebar.
#[derive(Debug, Clone, Serialize)]
pub struct RuntimeInfo {
    pub app_version: String,
    pub dsh_version: Option<String>,
    pub node_version: String,
    pub service_url: String,
    pub data_dir: String,
    pub log_path: String,
    pub platform: String,
    pub arch: String,
}

pub fn runtime_info<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) -> RuntimeInfo {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let installer = DshInstaller::new(app).ok();
    let node_version = crate::services::manager::get_bundled_node_version();

    RuntimeInfo {
        app_version: app.package_info().version.to_string(),
        dsh_version: installer.as_ref().and_then(|i| i.dsh_version()),
        node_version,
        service_url: service_url(config.port),
        data_dir: app_data_dir.clone(),
        log_path: PathBuf::from(&app_data_dir).join("logs").join("dsh-web.log").to_string_lossy().into_owned(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}
