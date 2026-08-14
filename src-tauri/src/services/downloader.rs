//! Download helper with progress events, URL fallback, and archive extraction.

use futures_util::StreamExt;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{Emitter, Runtime, Window};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (deepseek-harness-desktop)";

/// Minimum progress delta (percent) before a new event is emitted.
const PROGRESS_UPDATE_MIN_INCREMENT: f64 = 0.5;
/// Minimum time between progress events (ms).
const PROGRESS_UPDATE_MIN_INTERVAL_MS: u64 = 150;

#[cfg(unix)]
const EXECUTABLE_PERMISSIONS_MODE: u32 = 0o755;

#[derive(Clone, serde::Serialize)]
struct Progress {
    progress: f64,
    download_type: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ExtractionStart {
    pub download_type: String,
}

struct DownloadConfig {
    urls: Vec<String>,
    destination: PathBuf,
    download_type: String,
    is_archive: bool,
    destination_is_file: bool,
}

/// Download from the first URL that succeeds.
///
/// * `destination` is a directory when the payload is an archive that should be
///   extracted in place, or a file path otherwise.
pub async fn download_file<R: Runtime>(
    window: Window<R>,
    urls: Vec<String>,
    dest: PathBuf,
    download_type: &str,
) -> Result<(), String> {
    if urls.is_empty() {
        return Err("download: empty URL list".to_string());
    }

    let config = analyze_download_config(&urls, &dest, download_type);
    let mut last_error: Option<String> = None;

    for url in &config.urls {
        let cfg = DownloadConfig { urls: vec![url.clone()], ..clone_config(&config) };
        match process_downloaded_content(&window, &cfg).await {
            Ok(()) => {
                finalize_download(&window, &config);
                return Ok(());
            }
            Err(err) => {
                eprintln!("[downloader] URL '{url}' failed: {err}");
                last_error = Some(err);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "download failed".to_string()))
}

fn clone_config(config: &DownloadConfig) -> DownloadConfig {
    DownloadConfig {
        urls: Vec::new(),
        destination: config.destination.clone(),
        download_type: config.download_type.clone(),
        is_archive: config.is_archive,
        destination_is_file: config.destination_is_file,
    }
}

fn analyze_download_config(urls: &[String], dest: &Path, download_type: &str) -> DownloadConfig {
    let pure_url = urls.first().map(|u| u.split('?').next().unwrap_or(u).to_lowercase());
    let is_archive = pure_url
        .as_deref()
        .is_some_and(|u| [".tar.gz", ".tgz", ".zip"].iter().any(|ext| u.ends_with(ext)));
    let destination_is_file = dest.extension().is_some() && dest.parent().is_some();

    DownloadConfig {
        urls: urls.to_vec(),
        destination: dest.to_path_buf(),
        download_type: download_type.to_string(),
        is_archive,
        destination_is_file,
    }
}

async fn download_with_progress<R: Runtime>(
    window: &Window<R>,
    config: &DownloadConfig,
) -> Result<Vec<u8>, String> {
    let client = create_http_client()?;
    let response = fetch_http_response(&client, &config.urls[0]).await?;
    validate_http_response(&response, &config.urls[0])?;

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();
    let mut downloaded: u64 = 0;

    let mut last_emit_time = Instant::now();
    let mut last_emit_progress = -1.0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("download stream error: {e}"))?;
        buffer.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            update_progress_if_needed(
                window,
                downloaded,
                total_size,
                &config.download_type,
                &mut last_emit_time,
                &mut last_emit_progress,
            );
        }
    }

    Ok(buffer)
}

fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("create HTTP client failed: {e}"))
}

async fn fetch_http_response(
    client: &reqwest::Client,
    url: &str,
) -> Result<reqwest::Response, String> {
    client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed '{url}': {e}"))
}

fn validate_http_response(response: &reqwest::Response, url: &str) -> Result<(), String> {
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("download failed: HTTP {} for '{url}'", response.status()))
    }
}

fn update_progress_if_needed<R: Runtime>(
    window: &Window<R>,
    downloaded: u64,
    total: u64,
    download_type: &str,
    last_emit_time: &mut Instant,
    last_emit_progress: &mut f64,
) {
    let progress = (downloaded as f64 / total as f64) * 100.0;
    let time_elapsed = last_emit_time.elapsed() >= Duration::from_millis(PROGRESS_UPDATE_MIN_INTERVAL_MS);
    let progress_increased = progress - *last_emit_progress >= PROGRESS_UPDATE_MIN_INCREMENT;

    if time_elapsed || progress_increased {
        let _ = window.emit(
            "download-progress",
            Progress {
                progress,
                download_type: download_type.to_string(),
            },
        );
        *last_emit_progress = progress;
        *last_emit_time = Instant::now();
    }
}

async fn process_downloaded_content<R: Runtime>(
    window: &Window<R>,
    config: &DownloadConfig,
) -> Result<(), String> {
    let buffer = download_with_progress(window, config).await?;

    if config.is_archive && !config.destination_is_file {
        handle_archive_download(window, config, &buffer)
    } else {
        handle_file_download(config, &buffer)
    }
}

fn handle_archive_download<R: Runtime>(
    window: &Window<R>,
    config: &DownloadConfig,
    buffer: &[u8],
) -> Result<(), String> {
    prepare_destination_directory(&config.destination)?;
    let _ = window.emit(
        "extraction-start",
        ExtractionStart {
            download_type: config.download_type.clone(),
        },
    );

    extract_archive(buffer, &config.destination)?;
    flatten_single_directory(&config.destination)?;
    fix_permissions_if_needed(&config.destination)?;

    Ok(())
}

fn handle_file_download(config: &DownloadConfig, buffer: &[u8]) -> Result<(), String> {
    ensure_parent_directory_exists(&config.destination)?;
    fs::write(&config.destination, buffer)
        .map_err(|e| format!("write file '{}' failed: {e}", config.destination.display()))
}

/// Extract a downloaded archive into `dest` (cleaning it first), flattening a
/// single wrapping directory and fixing permissions.
pub fn extract_archive_to_dir(buffer: &[u8], dest: &Path) -> Result<(), String> {
    prepare_destination_directory(dest)?;
    extract_archive(buffer, dest)?;
    flatten_single_directory(dest)?;
    fix_permissions_if_needed(dest)?;
    Ok(())
}

fn prepare_destination_directory(dest: &Path) -> Result<(), String> {
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|e| format!("clean dir '{}' failed: {e}", dest.display()))?;
    }
    fs::create_dir_all(dest).map_err(|e| format!("create dir '{}' failed: {e}", dest.display()))
}

fn ensure_parent_directory_exists(file_path: &Path) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create parent dir '{}' failed: {e}", parent.display()))?;
    }
    Ok(())
}

fn extract_archive(buffer: &[u8], dest: &Path) -> Result<(), String> {
    if buffer.starts_with(&[0x1f, 0x8b]) {
        extract_tar_gz(buffer, dest)
    } else {
        extract_zip(buffer, dest)
    }
}

fn extract_zip(buffer: &[u8], dest: &Path) -> Result<(), String> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(buffer)).map_err(|e| format!("invalid zip: {e}"))?;
    archive.extract(dest).map_err(|e| format!("zip extract failed: {e}"))
}

fn extract_tar_gz(buffer: &[u8], dest: &Path) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let tar_gz = GzDecoder::new(Cursor::new(buffer));
    let mut archive = Archive::new(tar_gz);
    archive.unpack(dest).map_err(|e| format!("tar.gz extract failed: {e}"))
}

/// Flatten a single top-level directory so extraction lands directly in `dest`.
fn flatten_single_directory(dest: &Path) -> Result<(), String> {
    let entries: Vec<_> = fs::read_dir(dest)
        .map_err(|e| format!("read dir '{}' failed: {e}", dest.display()))?
        .filter_map(Result::ok)
        .collect();

    let directories: Vec<_> = entries
        .iter()
        .filter(|entry| {
            entry.path().is_dir()
                && entry
                    .file_name()
                    .to_str()
                    .is_some_and(|n| !n.starts_with('.'))
        })
        .collect();

    if directories.len() == 1 {
        let sub_dir = directories[0].path();
        flatten_directory_contents(&sub_dir, dest)?;
        fs::remove_dir(&sub_dir).map_err(|e| format!("remove dir '{}' failed: {e}", sub_dir.display()))?;
    }
    Ok(())
}

fn flatten_directory_contents(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    let entries = fs::read_dir(source_dir)
        .map_err(|e| format!("read dir '{}' failed: {e}", source_dir.display()))?;
    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("read dir entry failed: {e}"))?;
        let from = entry.path();
        let to = target_dir.join(entry.file_name());
        fs::rename(&from, &to).map_err(|e| {
            format!("move '{}' to '{}' failed: {e}", from.display(), to.display())
        })?;
    }
    Ok(())
}

#[cfg_attr(not(unix), allow(unused_variables))]
fn fix_permissions_if_needed(dest: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        fix_recursive_permissions(dest).map_err(|e| format!("fix permissions failed: {e}"))?;
        #[cfg(target_os = "macos")]
        remove_macos_quarantine_attribute(dest);
    }
    Ok(())
}

#[cfg(unix)]
fn fix_recursive_permissions(path: &Path) -> std::io::Result<()> {
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            fix_recursive_permissions(&entry.path())?;
        }
    } else {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_mode(EXECUTABLE_PERMISSIONS_MODE);
        fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn remove_macos_quarantine_attribute(path: &Path) {
    let _ = path.to_str().and_then(|p| {
        std::process::Command::new("xattr")
            .args(["-cr", p])
            .output()
            .ok()
    });
}

/// Emit a final 100% progress event after a successful download.
fn finalize_download<R: Runtime>(window: &Window<R>, config: &DownloadConfig) {
    let _ = window.emit(
        "download-progress",
        Progress {
            progress: 100.0,
            download_type: config.download_type.clone(),
        },
    );
}
