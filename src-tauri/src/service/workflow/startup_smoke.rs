//! 在隔离的 Windows AppData 和 DSH_HOME 中验证真实升级、并发启动及桌面就绪检查。

use std::{fs, io::Cursor, path::PathBuf, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use super::{has_owned_process, launch, proxy_health_check, start, stop};
use crate::{
    bridge, config,
    service::{core, download},
};

async fn exercise_upgrade(app: &tauri::AppHandle) -> Result<(), String> {
    exercise_pet_render(app).await?;
    smoke_note("begin isolated upgrade");
    let archive_path = std::env::var_os("WANGLAB_UPGRADE_CORE_ZIP")
        .ok_or("SMOKE_FIXTURE_MISSING: WANGLAB_UPGRADE_CORE_ZIP")?;
    let archive = fs::read(archive_path).map_err(|e| e.to_string())?;
    download::verify_sha256(
        &archive,
        "e91a59a86071d8aeb3c6a13751300fd970560b34296fe19d861788a43ff96e57",
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
    setting.dsh_pkg_tag = Some("dsh-0.1.2-rc.1-wanglab".to_string());
    setting.dsh_pkg_commit = Some("f0315c8cb4d8316d48fa0ad4e1d057fc8fd540f6".to_string());
    config::set_store_dat_setting(app, setting);

    let home = config::get_dsh_data_path(app);
    fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let sentinel = home.join("upgrade-preserved.txt");
    fs::write(&sentinel, "existing user data").map_err(|e| e.to_string())?;
    let profile = crate::service::profile::create(app, "Upgrade")?;
    crate::service::profile::set_active(app, &profile.id)?;

    let connection = config::get_dsh_install_path(app)
        .join("node_modules/@deepseek-ai/dsh-client-connection/lib/index.js");
    let old_connection = fs::read(&connection).map_err(|e| e.to_string())?;
    start(app.clone()).await?;
    smoke_note("old Core auto-start deferred");
    if has_owned_process() || fs::read(&connection).map_err(|e| e.to_string())? != old_connection {
        return Err("SMOKE_OLD_CORE_STARTED: auto-start touched the old Core".to_string());
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

    let mut latest = download::fetch_latest_dsh_pkg_info().await?;
    // CI 在官网上传前校验同一份发行资产；生产代码仍固定走官网并核验摘要。
    latest.asset_url = std::env::var("WANGLAB_TEST_CORE_URL")
        .map_err(|_| "SMOKE_FIXTURE_MISSING: WANGLAB_TEST_CORE_URL")?;
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
    start(app.clone()).await?;
    println!(
        "Windows restart readiness: {}",
        wait_for_readiness(port).await?
    );
    smoke_note("restart readiness passed");
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
    Err(format!("SMOKE_PET_RENDER_TIMEOUT: {:?}", bridge::get_pet_status(app.clone())))
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
    let directory = config::get_dsh_data_path(app).join("pets/render-fixture");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let manifest = serde_json::json!({
        "id": "render-fixture",
        "displayName": "Render fixture",
        "spriteVersionNumber": 2,
        "spritesheetPath": "sprite.png"
    });
    fs::write(directory.join("pet.json"), serde_json::to_vec(&manifest).unwrap())
        .map_err(|e| e.to_string())?;
    let sprite = image::RgbaImage::from_fn(128, 176, |x, y| {
        if (3..13).contains(&(x % 16)) && (2..15).contains(&(y % 16)) {
            image::Rgba([35, 180, 145, 255])
        } else {
            image::Rgba([0, 0, 0, 0])
        }
    });
    let mut png = Cursor::new(Vec::new());
    sprite.write_to(&mut png, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let png = png.into_inner();
    let sprite_path = directory.join("sprite.png");
    fs::write(&sprite_path, &png).map_err(|e| e.to_string())?;
    let selected = bridge::set_active_pet(app.clone(), "chat:render-fixture".to_string())?;
    if selected.ready {
        return Err("SMOKE_PET_READY_BEFORE_DECODE".to_string());
    }
    bridge::set_pet_enabled(app.clone(), true)?;
    wait_for_pet(app, true).await?;
    let window = app.get_webview_window("pet").ok_or("SMOKE_PET_WINDOW_MISSING")?;
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Err("SMOKE_PET_WINDOW_NOT_VISIBLE".to_string());
    }
    smoke_note("pet WebView2 sprite decoding and window visibility passed");

    let hidden = bridge::hide_pet(app.clone())?;
    if hidden.ready || hidden.visible || !hidden.enabled {
        return Err("SMOKE_PET_HIDE_STATE_INVALID".to_string());
    }
    bridge::show_pet(app.clone())?;
    wait_for_pet(app, true).await?;
    smoke_note("pet hide and wake passed");

    // 保留合法尺寸头但截断 PNG，确保真正走到浏览器解码错误回报路径。
    fs::write(&sprite_path, &png[..33]).map_err(|e| e.to_string())?;
    bridge::show_pet(app.clone())?;
    let failed = wait_for_pet(app, false).await?;
    if failed.ready || failed.visible || window.is_visible().map_err(|e| e.to_string())? {
        return Err(format!("SMOKE_PET_FAILURE_REMAINS_VISIBLE: {failed:?}"));
    }
    fs::write(&sprite_path, &png).map_err(|e| e.to_string())?;
    bridge::show_pet(app.clone())?;
    wait_for_pet(app, true).await?;
    bridge::set_pet_enabled(app.clone(), false)?;
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
    assert!(!tauri::is_dev(), "run this test with --features tauri/custom-protocol");
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
    let app = tauri::Builder::default()
        .any_thread()
        .manage(crate::desktop::pet_mouse::PetMouseStreamState::default())
        .invoke_handler(crate::desktop::handler())
        .plugin(tauri_plugin_store::Builder::default().build())
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
