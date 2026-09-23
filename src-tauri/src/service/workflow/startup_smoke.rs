//! 在隔离的 Windows AppData 和 DSH_HOME 中验证真实升级、并发启动及桌面就绪检查。

use std::{fs, io::Cursor, path::PathBuf, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use super::{has_owned_process, launch, proxy_health_check, start, stop};
use crate::{
    bridge, config,
    service::{core, download},
};

#[derive(Default)]
struct FrontendSmokeState(std::sync::Mutex<Option<serde_json::Value>>);

#[tauri::command]
fn report_startup_smoke_ui(app_handle: tauri::AppHandle, state: serde_json::Value) {
    *app_handle.state::<FrontendSmokeState>().0.lock().unwrap() = Some(state);
}

async fn exercise_upgrade(app: &tauri::AppHandle) -> Result<(), String> {
    exercise_pet_render(app).await?;
    smoke_note("begin isolated upgrade");
    let archive_path = std::env::var_os("WANGLAB_UPGRADE_CORE_ZIP")
        .ok_or("SMOKE_FIXTURE_MISSING: WANGLAB_UPGRADE_CORE_ZIP")?;
    let archive = fs::read(archive_path).map_err(|e| e.to_string())?;
    download::verify_sha256(
        &archive,
        "bbcc677fe359b2766fe367d5937e9f1c39024f1a7464b680dc8a6480d6ec2240",
    )?;
    let window = app
        .get_webview_window("main")
        .ok_or("SMOKE_WINDOW_MISSING")?;
    let tracker = download::ProgressTracker::new(&window, 1);
    download::ensure_extract(
        &tracker,
        "old-core.zip".to_string(),
        archive,
        config::get_dsh_install_path(app),
    )
    .await?;
    smoke_note("old Core extracted");

    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    let mut setting = config::get_store_dat_setting(app);
    setting.installed = true;
    setting.cli_link_enabled = false;
    setting.port = port;
    setting.manual_port = Some(port);
    setting.active_core = Some("app".to_string());
    setting.dsh_pkg_tag = Some("dsh-0.1.2-rc.1-wanglab032".to_string());
    setting.dsh_pkg_commit = Some("90e7887e78256f577b945dc3a22a1926d59cf131".to_string());
    config::set_store_dat_setting(app, setting);

    let home = config::get_dsh_data_path(app);
    fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let sentinel = home.join("upgrade-preserved.txt");
    fs::write(&sentinel, "existing user data").map_err(|e| e.to_string())?;
    let profile = crate::service::profile::create(app, "Upgrade")?;
    crate::service::profile::set_active(app, &profile.id)?;
    exercise_session_upgrade(app, "seed").await?;

    let connection = config::get_dsh_install_path(app)
        .join("node_modules/@deepseek-ai/dsh-client-connection/lib/index.js");
    let old_connection = fs::read(&connection).map_err(|e| e.to_string())?;
    start(app.clone()).await?;
    smoke_note("old Core auto-start deferred");
    if has_owned_process() {
        return Err("SMOKE_OLD_CORE_STARTED: auto-start launched the old Core".to_string());
    }
    if fs::read(&connection).map_err(|e| e.to_string())? != old_connection {
        return Err("SMOKE_OLD_CORE_MODIFIED: auto-start changed the old Core".to_string());
    }
    if !launch(app.clone())
        .await
        .is_err_and(|e| e.starts_with("CORE_INSTALL_REQUIRED"))
    {
        return Err(
            "SMOKE_OLD_CORE_ACCEPTED: explicit launch must require the paired Core".to_string(),
        );
    }
    if !bridge::ensure_internal_plugins(app.clone())
        .await
        .is_err_and(|e| e.starts_with("CORE_INSTALL_REQUIRED"))
    {
        return Err(
            "SMOKE_OLD_PLUGINS_ACCEPTED: plugin preparation must require the paired Core"
                .to_string(),
        );
    }

    let latest = download::fetch_latest_dsh_pkg_info().await?;
    // CI 在官网上传前校验同一份发行资产；生产代码仍固定走官网并核验摘要。
    let test_core_url = std::env::var("WANGLAB_TEST_CORE_URL")
        .map_err(|_| "SMOKE_FIXTURE_MISSING: WANGLAB_TEST_CORE_URL")?;
    if latest.asset_url != test_core_url {
        return Err(
            "SMOKE_FIXTURE_IGNORED: release candidate Core URL was not applied".to_string(),
        );
    }
    // 先轮询安装以取得目录锁，首次异步停服时让其余真实入口同时等待这把锁。
    let (installed, auto_started, plugins_ready, manual_started) = tokio::join!(
        biased;
        super::install(app, Some(latest)),
        start(app.clone()),
        bridge::ensure_internal_plugins(app.clone()),
        launch(app.clone()),
    );
    if !installed? {
        return Err("SMOKE_CORE_NOT_UPDATED".to_string());
    }
    smoke_note("Core installation completed");
    auto_started?;
    plugins_ready?;
    manual_started?;
    if !core::paired_core_ready(app) {
        return Err("SMOKE_PAIR_MISMATCH".to_string());
    }

    let port = config::get_store_dat_setting(app).port;
    println!(
        "Windows upgrade readiness: {}",
        wait_for_readiness(port).await?
    );
    smoke_note("upgrade readiness passed");
    if fs::read_to_string(sentinel).map_err(|e| e.to_string())? != "existing user data" {
        return Err("SMOKE_USER_DATA_CHANGED".to_string());
    }
    stop(app.clone()).await?;
    exercise_session_upgrade(app, "verify").await?;
    start(app.clone()).await?;
    println!(
        "Windows restart readiness: {}",
        wait_for_readiness(port).await?
    );
    smoke_note("restart readiness passed");
    exercise_session_upgrade(app, "restart").await?;
    stop(app.clone()).await?;
    exercise_frontend_upgrade(app).await?;
    stop(app.clone()).await?;
    exercise_mixed_core_record(app).await?;
    Ok(())
}

/// 复现 0.4.1 用户的新文件、新提交、旧标签，确认修复无需下载且真实主窗口可启动。
async fn exercise_mixed_core_record(app: &tauri::AppHandle) -> Result<(), String> {
    core::require_paired_core(app)?;
    let marker = config::get_dsh_install_path(app).join("record-repair-preserved.txt");
    fs::write(&marker, "keep installed Core files").map_err(|e| e.to_string())?;
    let settings_before = config::get_store_dat_setting(app);
    config::update_store_dat_setting(app, |setting| {
        setting.dsh_pkg_tag = Some("dsh-0.1.2-rc.1-wanglab032".to_string());
    });
    let paired_state = core::paired_core_state(app);
    let manifest_version = config::get_dsh_version(app);
    if paired_state != core::PairedCoreState::RepairTag
        || manifest_version.as_deref() != Some(config::WANGLAB_DSH_VERSION)
    {
        return Err(format!(
            "SMOKE_MIXED_RECORD_NOT_REPRODUCED: state={paired_state:?}, manifest={manifest_version:?}"
        ));
    }
    let mut latest = download::fetch_latest_dsh_pkg_info().await?;
    latest.asset_url = "http://127.0.0.1:0/must-not-download.zip".to_string();
    if super::install(app, Some(latest)).await? {
        return Err("SMOKE_RECORD_REPAIR_REINSTALLED_CORE".to_string());
    }
    core::require_paired_core(app)?;
    if config::get_store_dat_setting(app) != settings_before {
        return Err("SMOKE_RECORD_REPAIR_CHANGED_SETTINGS".to_string());
    }
    smoke_note("mixed Core record repaired without downloading or changing settings");

    let previous = config::update_store_dat_setting(app, |setting| {
        setting.dsh_pkg_tag = Some("dsh-0.1.2-rc.1-wanglab032".to_string());
    });
    exercise_frontend_startup(app, previous).await?;
    if fs::read_to_string(marker).map_err(|e| e.to_string())? != "keep installed Core files" {
        return Err("SMOKE_RECORD_REPAIR_REPLACED_FILES".to_string());
    }
    smoke_note(
        "real frontend repaired mixed Core records and preserved installed files and sessions",
    );
    Ok(())
}

/// 用真实主页面执行第二轮升级，覆盖前端持久化与后端安装记录之间的竞争。
async fn exercise_frontend_upgrade(app: &tauri::AppHandle) -> Result<(), String> {
    let archive_path = std::env::var_os("WANGLAB_UPGRADE_CORE_ZIP")
        .ok_or("SMOKE_FIXTURE_MISSING: WANGLAB_UPGRADE_CORE_ZIP")?;
    let archive = fs::read(archive_path).map_err(|e| e.to_string())?;
    let window = app
        .get_webview_window("main")
        .ok_or("SMOKE_WINDOW_MISSING")?;
    let tracker = download::ProgressTracker::new(&window, 1);
    download::ensure_extract(
        &tracker,
        "old-core.zip".to_string(),
        archive,
        config::get_dsh_install_path(app),
    )
    .await?;
    let previous = config::update_store_dat_setting(app, |setting| {
        setting.installed = true;
        setting.language = "en-US".to_string();
        setting.dsh_pkg_tag = Some("dsh-0.1.2-rc.1-wanglab032".to_string());
        setting.dsh_pkg_commit = Some("90e7887e78256f577b945dc3a22a1926d59cf131".to_string());
    });
    exercise_frontend_startup(app, previous).await
}

async fn exercise_frontend_startup(
    app: &tauri::AppHandle,
    previous: config::Setting,
) -> Result<(), String> {
    bridge::skip_preinstall_plugins(app.clone()).await?;
    let window = app
        .get_webview_window("main")
        .ok_or("SMOKE_WINDOW_MISSING")?;
    let keeper = WebviewWindowBuilder::new(
        app,
        "upgrade-keepalive",
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    window.destroy().map_err(|e| e.to_string())?;
    for _ in 0..50 {
        if app.get_webview_window("main").is_none() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    *app.state::<FrontendSmokeState>().0.lock().unwrap() = None;
    let window = crate::desktop::builder::build_main_window(app).map_err(|e| e.to_string())?;
    keeper.destroy().map_err(|e| e.to_string())?;
    smoke_note("real frontend opened with previous Core records");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(240);
    let mut ready = false;
    while tokio::time::Instant::now() < deadline {
        window
            .eval(
                r#"(() => {
                    const frame = document.querySelector('iframe');
                    const bounds = frame?.getBoundingClientRect();
                    window.__TAURI_INTERNALS__.invoke('report_startup_smoke_ui', {
                        state: {
                            iframeVisible: !!bounds && bounds.width > 0 && bounds.height > 0,
                            text: (document.body?.innerText || '').slice(0, 1000)
                        }
                    });
                })()"#,
            )
            .map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(500)).await;
        let state = app.state::<FrontendSmokeState>().0.lock().unwrap().clone();
        if state.as_ref().is_some_and(|value| {
            value["text"]
                .as_str()
                .is_some_and(|text| text.contains("Startup failed"))
        }) {
            return Err(format!("SMOKE_FRONTEND_STARTUP_FAILED: {state:?}"));
        }
        if state
            .as_ref()
            .is_some_and(|value| value["iframeVisible"] == true)
            && core::paired_core_ready(app)
            && proxy_health_check(previous.port).await.is_ok()
        {
            ready = true;
            break;
        }
    }
    if !ready {
        return Err(format!(
            "SMOKE_FRONTEND_TIMEOUT: {:?}",
            app.state::<FrontendSmokeState>().0.lock().unwrap()
        ));
    }

    let mut stale = serde_json::to_value(&previous).map_err(|e| e.to_string())?;
    stale["zoom_factor"] = serde_json::json!(1.2);
    let args = serde_json::json!({ "preferences": stale });
    window
        .eval(&format!(
            "window.__TAURI_INTERNALS__.invoke('save_frontend_preferences', {args})"
        ))
        .map_err(|e| e.to_string())?;
    for _ in 0..50 {
        if config::get_store_dat_setting(app).zoom_factor == 1.2 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let current = config::get_store_dat_setting(app);
    if current.zoom_factor != 1.2 || current.active_profile != previous.active_profile {
        return Err("SMOKE_FRONTEND_PREFERENCES_FAILED".to_string());
    }
    core::require_paired_core(app)?;
    exercise_session_upgrade(app, "restart").await?;
    smoke_note("real frontend startup, settings persistence, and session readiness passed");
    Ok(())
}

async fn exercise_session_upgrade(app: &tauri::AppHandle, mode: &str) -> Result<(), String> {
    let script =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/smoke-session-upgrade.mjs");
    let mut command = tokio::process::Command::new(config::get_node_binary_path(app));
    command
        .arg(script)
        .arg(mode)
        .arg(config::get_dsh_install_path(app))
        .arg(config::get_dsh_data_path(app))
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(60), command.output())
        .await
        .map_err(|e| format!("SMOKE_SESSION_TIMEOUT: {mode}: {e}"))?
        .map_err(|e| format!("SMOKE_SESSION_SPAWN: {mode}: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "SMOKE_SESSION_UPGRADE: {mode}: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    smoke_note(String::from_utf8_lossy(&output.stdout).trim());
    Ok(())
}

async fn wait_for_pet(app: &tauri::AppHandle, ready: bool) -> Result<bridge::PetStatus, String> {
    for _ in 0..150 {
        let status = bridge::get_pet_status(app.clone());
        if ready && status.ready || !ready && status.error.is_some() {
            return Ok(status);
        }
        if ready && status.error.is_some() {
            return Err(format!("SMOKE_PET_RENDER_FAILED: {status:?}"));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(format!(
        "SMOKE_PET_RENDER_TIMEOUT: {:?}",
        bridge::get_pet_status(app.clone())
    ))
}

async fn wait_for_pet_closed(app: &tauri::AppHandle) -> Result<(), String> {
    for _ in 0..150 {
        if app.get_webview_window("pet").is_none() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err("SMOKE_PET_WINDOW_NOT_DESTROYED".to_string())
}

/// 使用测试专用图集在真实 WebView2 中解码，避免仅验证窗口开关就误判桌宠可见。
async fn exercise_pet_render(app: &tauri::AppHandle) -> Result<(), String> {
    let initial = bridge::get_pet_status(app.clone());
    if initial.active_pet.is_some() || initial.enabled || initial.visible || initial.ready {
        return Err(format!("SMOKE_PET_DEFAULT_RETAINED: {initial:?}"));
    }
    if bridge::set_pet_enabled(app.clone(), true).is_ok() {
        return Err("SMOKE_PET_EMPTY_SELECTION_ENABLED".to_string());
    }
    let source_error = bridge::list_pets(app.clone(), "codex".to_string())
        .expect_err("Codex pet directories must not be read");
    if !source_error.starts_with("PET_SOURCE_INVALID:") {
        return Err(format!(
            "SMOKE_PET_EXTERNAL_SOURCE_ACCEPTED: {source_error}"
        ));
    }
    for size in [0.0, 24.9, 201.0, f64::NAN] {
        if bridge::set_pet_size(app.clone(), size).is_ok() {
            return Err(format!("SMOKE_PET_INVALID_SIZE_ACCEPTED: {size}"));
        }
    }
    for (version, rows) in [(1, 9), (2, 11)] {
        exercise_sprite_render(app, version, rows).await?;
    }
    Ok(())
}

#[cfg(windows)]
async fn exercise_sprite_render(
    app: &tauri::AppHandle,
    version: u8,
    rows: u32,
) -> Result<(), String> {
    let id = format!("render-fixture-v{version}");
    let directory = config::get_dsh_data_path(app).join("pets").join(&id);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut manifest = serde_json::json!({
        "id": id,
        "displayName": "Render fixture",
        "spriteVersionNumber": version,
        "spritesheetPath": "sprite.png"
    });
    // 原站的 v1 包没有版本字段，真实 WebView 也必须能够加载。
    if version == 1 {
        manifest
            .as_object_mut()
            .unwrap()
            .remove("spriteVersionNumber");
    }
    fs::write(
        directory.join("pet.json"),
        serde_json::to_vec(&manifest).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    let sprite = image::RgbaImage::from_fn(128, rows * 16, |x, y| {
        if (3..13).contains(&(x % 16)) && (2..15).contains(&(y % 16)) {
            image::Rgba([35, 180, 145, 255])
        } else {
            image::Rgba([0, 0, 0, 0])
        }
    });
    let mut png = Cursor::new(Vec::new());
    sprite
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let png = png.into_inner();
    let sprite_path = directory.join("sprite.png");
    fs::write(&sprite_path, &png).map_err(|e| e.to_string())?;
    let selected = bridge::set_active_pet(app.clone(), format!("chat:{id}"))?;
    if selected.ready {
        return Err("SMOKE_PET_READY_BEFORE_DECODE".to_string());
    }
    bridge::set_pet_enabled(app.clone(), true)?;
    wait_for_pet(app, true).await?;
    let window = app
        .get_webview_window("pet")
        .ok_or("SMOKE_PET_WINDOW_MISSING")?;
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Err("SMOKE_PET_WINDOW_NOT_VISIBLE".to_string());
    }
    smoke_note(&format!(
        "pet v{version} WebView2 sprite decoding and window visibility passed"
    ));

    for percent in [50.0, 25.0] {
        let status = bridge::set_pet_size(app.clone(), percent)?;
        if status.pet_size != Some(percent)
            || config::get_store_dat_setting(app).pet_size != Some(percent)
            || crate::desktop::pet::get_pet_size_percent(app) != percent
        {
            return Err(format!("SMOKE_PET_SIZE_NOT_SAVED: {percent}"));
        }
        // 测试图集每帧为正方形，原生窗口应跟随 WebView 实际比例，而非默认图集比例。
        let expected_height = 220.0 * percent / 100.0 + 82.0;
        let mut resized = false;
        for _ in 0..50 {
            let size = window
                .inner_size()
                .map_err(|e| e.to_string())?
                .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
            if (size.width - 420.0).abs() <= 1.0 && (size.height - expected_height).abs() <= 1.0 {
                resized = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if !resized {
            return Err(format!("SMOKE_PET_SIZE_NOT_APPLIED: {percent}"));
        }
    }
    smoke_note("pet 25% size persistence and native window resizing passed");

    let hidden = bridge::set_pet_enabled(app.clone(), false)?;
    if hidden.ready
        || hidden.visible
        || hidden.enabled
        || config::get_store_dat_setting(app).pet_enabled
    {
        return Err("SMOKE_PET_HIDE_STATE_INVALID".to_string());
    }
    wait_for_pet_closed(app).await?;
    crate::desktop::pet::init_pet_window(app);
    if bridge::get_pet_status(app.clone()).enabled || app.get_webview_window("pet").is_some() {
        return Err("SMOKE_PET_CLOSE_NOT_PERSISTED".to_string());
    }
    bridge::set_pet_enabled(app.clone(), true)?;
    let woken = wait_for_pet(app, true).await?;
    if woken.pet_size != Some(25.0) {
        return Err("SMOKE_PET_SIZE_LOST_ON_WAKE".to_string());
    }
    let recreated = app
        .get_webview_window("pet")
        .ok_or("SMOKE_PET_WINDOW_MISSING")?;
    if !recreated.is_visible().map_err(|e| e.to_string())? {
        return Err("SMOKE_PET_RECREATED_WINDOW_NOT_VISIBLE".to_string());
    }
    smoke_note("pet persistent close, window destruction and wake passed");

    // 保留合法尺寸头但截断 PNG，确保真正走到浏览器解码错误回报路径。
    fs::write(&sprite_path, &png[..33]).map_err(|e| e.to_string())?;
    bridge::set_pet_enabled(app.clone(), true)?;
    let failed = wait_for_pet(app, false).await?;
    if failed.ready || failed.visible {
        return Err(format!("SMOKE_PET_FAILURE_REMAINS_VISIBLE: {failed:?}"));
    }
    wait_for_pet_closed(app).await?;
    fs::write(&sprite_path, &png).map_err(|e| e.to_string())?;
    bridge::set_pet_enabled(app.clone(), true)?;
    wait_for_pet(app, true).await?;
    bridge::set_pet_enabled(app.clone(), false)?;
    wait_for_pet_closed(app).await?;
    smoke_note("pet corrupt media detection and retry passed");
    Ok(())
}

fn smoke_note(message: &str) {
    println!("SMOKE_STAGE: {message}");
    if let Some(path) = std::env::var_os("GITHUB_STEP_SUMMARY") {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "- {message}");
        }
    }
}

async fn wait_for_readiness(port: u16) -> Result<String, String> {
    let mut last_error = String::new();
    for _ in 0..60 {
        match proxy_health_check(port).await {
            Ok(result) => return Ok(result),
            Err(error) => last_error = error,
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err(last_error)
}

#[test]
#[ignore = "requires Windows release resources and the previous public Core ZIP"]
fn windows_upgrade_startup() {
    assert!(
        !tauri::is_dev(),
        "run this test with --features tauri/custom-protocol"
    );
    assert!(
        !cfg!(debug_assertions),
        "run this test with --release for isolated DSH_HOME"
    );
    let root = std::env::temp_dir().join(format!("wanglab-startup-smoke-{}", std::process::id()));
    assert!(!root.exists(), "smoke directory must be fresh");
    fs::create_dir_all(&root).expect("create isolated smoke home");
    std::env::set_var("DSH_HOME", root.join("home"));
    let mut context = tauri::generate_context!();
    context.config_mut().identifier =
        format!("com.seuwanglab.startup-smoke-{}", std::process::id());
    let (result_tx, result_rx) = std::sync::mpsc::channel();
    let desktop_handler = crate::desktop::handler();
    let smoke_handler: Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync> =
        Box::new(tauri::generate_handler![report_startup_smoke_ui]);
    let app = tauri::Builder::default()
        .any_thread()
        .manage(FrontendSmokeState::default())
        .manage(crate::desktop::pet_mouse::PetMouseStreamState::default())
        .invoke_handler(move |invoke| {
            if invoke.message.command() == "report_startup_smoke_ui" {
                smoke_handler(invoke)
            } else {
                desktop_handler(invoke)
            }
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse()?))
                .visible(false)
                .build()?;
            config::update_store_dat_setting(app.handle(), |setting| {
                setting.active_pet = Some("maid-deepseek-whale".to_string());
                setting.pet_enabled = true;
            });
            crate::desktop::pet::init_pet_window(app.handle());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result =
                    tokio::time::timeout(Duration::from_secs(900), exercise_upgrade(&handle))
                        .await
                        .map_err(|e| format!("SMOKE_TIMEOUT: {e}"))
                        .and_then(|r| r);
                let _ = stop(handle.clone()).await;
                let _ = result_tx.send(result);
                handle.exit(0);
            });
            Ok(())
        })
        .build(context)
        .expect("build smoke Tauri app");
    let base: PathBuf = config::get_base_dir(app.handle());
    let log_path = config::get_service_log_path(app.handle());
    app.run_return(|_, _| {});
    let result = result_rx.recv().expect("receive startup result");
    if result.is_err() {
        if let Ok(log) = fs::read_to_string(log_path) {
            let token = regex::Regex::new(r"([?&]token=)[^\s&]+").unwrap();
            smoke_note(&format!(
                "Core log: {}",
                token.replace_all(&log, "$1[REDACTED]")
            ));
        }
    }
    let _ = fs::remove_dir_all(base);
    let _ = fs::remove_dir_all(root);
    if let Err(error) = result {
        if let Some(path) = std::env::var_os("GITHUB_STEP_SUMMARY") {
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
            {
                let _ = writeln!(file, "\n**SMOKE_FAILURE:** `{error}`");
            }
        }
        panic!("Windows desktop upgrade and readiness: {error}");
    }
}
