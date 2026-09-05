//! 在隔离的 Windows AppData 和 DSH_HOME 中验证真实升级、并发启动及桌面就绪检查。

use std::{fs, path::PathBuf, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use super::{has_owned_process, launch, proxy_health_check, start, stop};
use crate::{
    bridge, config,
    service::{core, download},
};

async fn exercise_upgrade(app: &tauri::AppHandle) -> Result<(), String> {
    smoke_note("begin isolated upgrade");
    let archive_path = std::env::var_os("WANGLAB_UPGRADE_CORE_ZIP")
        .ok_or("SMOKE_FIXTURE_MISSING: WANGLAB_UPGRADE_CORE_ZIP")?;
    let archive = fs::read(archive_path).map_err(|e| e.to_string())?;
    download::verify_sha256(
        &archive,
        "4c04619e29f9d5cadfdc46da0d65d32a7d1c6fc3f419a38b86b8dd39dfd88dce",
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
    setting.dsh_pkg_tag = Some("dsh-0.1.1-rc.2-wanglab".to_string());
    setting.dsh_pkg_commit = Some("40a72cfabc3c7c7bd0a64c8c4cc1b7ab1efdada1".to_string());
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

    let latest = download::fetch_latest_dsh_pkg_info().await?;
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse()?))
                .visible(false)
                .build()?;
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
    app.run_return(|_, _| {});
    let result = result_rx.recv().expect("receive startup result");
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
