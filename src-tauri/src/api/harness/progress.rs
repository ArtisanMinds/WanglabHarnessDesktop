//! Install progress tracking and streaming download, modeled on the early
//! n8n-based `hairyf/damn-reports` installer: one `install-progress` event
//! stream drives the download/install page in the frontend.

use futures_util::StreamExt;
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Runtime, Window};

const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (deepseek-harness-desktop)";

/// Payload of the `install-progress` event consumed by the installer page.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub title: String,
    pub detail: String,
    pub log: String,
    pub r#type: String,
    /// Global progress across all install phases (0.0 - 100.0).
    pub percentage: f64,
    /// Progress of the current phase (0.0 - 100.0).
    pub progress: f64,
}

/// Divides installation into phases (e.g. download + extract per component)
/// and reports global progress through `install-progress` events.
pub struct ProgressTracker<'a, R: Runtime> {
    window: &'a Window<R>,
    total_phases: usize,
    current_phase: usize,
    current_title: String,
    current_type: String,
    last_emit_time: Mutex<Option<Instant>>,
}

impl<'a, R: Runtime> ProgressTracker<'a, R> {
    pub fn new(window: &'a Window<R>, total_phases: usize) -> Self {
        Self {
            window,
            total_phases,
            current_phase: 0,
            current_title: String::from("preparing"),
            current_type: String::new(),
            last_emit_time: Mutex::new(None),
        }
    }

    /// Switch to a new phase and set its headline title.
    pub fn start_phase(&mut self, r#type: &str, title: &str) {
        self.current_title = title.to_string();
        self.current_type = r#type.to_string();
    }

    /// Mark the current phase as complete.
    pub fn end_phase(&mut self) {
        if self.current_phase < self.total_phases {
            self.current_phase += 1;
        }
    }

    /// Skip a phase (used when a component is already installed).
    pub fn skip_phases(&mut self, count: usize) {
        self.current_phase = (self.current_phase + count).min(self.total_phases);
    }

    /// `stage_pct`: progress of the current phase (0.0 - 100.0).
    /// `detail`: main line shown under the title (e.g. "Downloaded 12.3 MB / 51.5 MB").
    /// `log`: one line appended to the terminal-style log panel.
    pub fn update(&self, stage_pct: f64, detail: String, log: String) {
        let now = Instant::now();
        let mut last_emit = match self.last_emit_time.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        if let Some(last_time) = *last_emit {
            if now.duration_since(last_time) < Duration::from_millis(50) {
                return;
            }
        }
        *last_emit = Some(now);

        let phase_weight = 100.0 / self.total_phases.max(1) as f64;
        let global_pct =
            (self.current_phase as f64 * phase_weight) + (stage_pct * phase_weight / 100.0);

        let _ = self.window.emit(
            "install-progress",
            ProgressPayload {
                title: self.current_title.clone(),
                r#type: self.current_type.clone(),
                percentage: global_pct.min(100.0),
                progress: stage_pct.min(100.0),
                detail,
                log,
            },
        );
    }
}

/// Stream a download from the first URL that succeeds, reporting progress.
pub async fn tracked_download<R: Runtime>(
    tracker: &ProgressTracker<'_, R>,
    urls: &[String],
) -> Result<Vec<u8>, String> {
    if urls.is_empty() {
        return Err("download: empty URL list".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("create HTTP client failed: {e}"))?;

    let mut last_error: Option<String> = None;
    for url in urls {
        match download_one(tracker, &client, url).await {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                eprintln!("[install] download failed ({url}): {err}");
                last_error = Some(err);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "download failed".to_string()))
}

async fn download_one<R: Runtime>(
    tracker: &ProgressTracker<'_, R>,
    client: &reqwest::Client,
    url: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed '{url}': {e}"))?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {} for '{url}'", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("download stream error: {e}"))?;
        buffer.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let pct = (downloaded as f64 / total_size as f64) * 100.0;
            tracker.update(
                pct,
                format!(
                    "{} {:.1} MB / {:.1} MB",
                    crate::i18n::t("install.downloaded"),
                    downloaded as f64 / 1_000_000.0,
                    total_size as f64 / 1_000_000.0
                ),
                format!("Download {url}"),
            );
        }
    }

    Ok(buffer)
}
