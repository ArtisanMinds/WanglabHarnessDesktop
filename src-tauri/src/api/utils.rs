//! Small shared helpers for the API layer.

use crate::api::harness::AppConfig;
use tauri::{AppHandle, Runtime};

/// Resolve the currently configured service port.
pub fn active_port<R: Runtime>(app: &AppHandle<R>) -> u16 {
    AppConfig::load(app).port
}
