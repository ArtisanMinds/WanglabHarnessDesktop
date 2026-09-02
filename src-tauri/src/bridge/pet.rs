//! bridge/pet.rs — 桌宠（外置透明宠物窗口）的 Tauri 命令出口。
//!
//! 这些命令被 dsh 容器（iframe 内的 dsh 界面 / dsh-tauri-pet 插件）经
//! invoke 桥调用（见 `desktop::gravity`? 实际为壳层桥监听模块
//! `src/hooks/use-iframe-invoke.ts`，把 iframe 的 postMessage invoke 转发到
//! `@tauri-apps/api/core` 的 `invoke`）。所有状态读写统一落在
//! `config::setting`（持久化）与 `desktop::pet`（窗口）。错误遵循仓库约定：
//! `Result<_, String>`，Err 以大写协议前缀开头（如 `PET_WINDOW_*:`）。

use crate::config;
use crate::desktop::pet as pet_window;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 桌宠当前状态（设置页与插件读取）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PetStatus {
    /// 桌宠是否启用（决定是否显示外置宠物窗口）。
    pub enabled: bool,
    /// 当前选中的桌宠模型包名；None/空 = 未选择（默认宠）。
    pub active_pet: Option<String>,
}

/// 查询桌宠当前状态（启用与否 + 当前选择的宠物模型）。
#[tauri::command]
pub fn get_pet_status(app: AppHandle) -> PetStatus {
    let setting = config::get_store_dat_setting(&app);
    PetStatus {
        enabled: setting.pet_enabled,
        active_pet: setting.active_pet.clone(),
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

    Ok(PetStatus {
        enabled: updated.pet_enabled,
        active_pet: updated.active_pet.clone(),
    })
}

/// 选择桌宠模型包（设置页「选择宠物」），并持久化 active_pet。
///
/// `id` 为模型包标志（`x.x.x.sprites/` 目录名或用户导入的 .zip 包名）。
#[tauri::command]
pub fn set_active_pet(app: AppHandle, id: String) -> Result<PetStatus, String> {
    let id = id.trim().to_string();
    if id.is_empty() {
        return Err("PET_ID_EMPTY: active pet id must not be empty".to_string());
    }
    let updated = config::update_store_dat_setting(&app, |setting| {
        setting.active_pet = Some(id);
    });

    Ok(PetStatus {
        enabled: updated.pet_enabled,
        active_pet: updated.active_pet.clone(),
    })
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