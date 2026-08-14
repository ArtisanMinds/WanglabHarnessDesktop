pub mod api;
pub mod i18n;
pub mod services;

use tauri::RunEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            api::commands::is_installed,
            api::commands::setup_runtime,
            api::commands::install_dependencies,
            api::commands::setup_harness,
            api::commands::launch_harness,
            api::commands::shutdown_harness,
            api::commands::proxy_health_check,
            api::commands::get_runtime_info,
            api::commands::get_app_config,
            api::commands::update_app_config,
            api::commands::open_in_browser,
            api::commands::copy_service_url,
            api::commands::reveal_data_dir,
            api::commands::read_service_logs,
            api::commands::clear_service_logs,
            api::commands::set_language,
            api::commands::toggle_sidebar,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| handle_app_run_event(event));
}

fn handle_app_run_event(event: RunEvent) {
    if let RunEvent::ExitRequested { .. } = event {
        if let Err(err) = api::harness::shutdown_harness() {
            eprintln!("[dsh] failed to stop harness on exit: {err}");
        }
        println!("[dsh] application exiting, harness stopped");
    }
}
