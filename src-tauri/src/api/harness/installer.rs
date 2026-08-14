//! Installer for the packaged DeepSeek Harness distribution.
//!
//! The packaged distribution is produced by the
//! `hairyf/deepseek-harness-pkg` repository and published as a GitHub release
//! with one zip per platform/architecture:
//!
//! ```text
//! dsh-core-<os>-<arch>.zip
//! ```
//!
//! The zip contains a single `dsh-core/` directory whose layout is documented
//! in `docs/PKG-CONTRACT.md` (entry CLI, `node_modules`, and a manifest
//! describing the exact `dsh` version and entry path).

use crate::i18n;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use zip::ZipArchive;

use super::constants::*;
use super::error::{DshError, DshResult};

/// Manifest of the packaged harness distribution (see `docs/PKG-CONTRACT.md`).
#[derive(Debug, Clone, Deserialize)]
pub struct DshManifest {
    pub name: Option<String>,
    pub version: Option<String>,
    pub dependencies: Option<HashMap<String, String>>,
    #[serde(rename = "dsh")]
    pub dsh: Option<DshManifestSection>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DshManifestSection {
    pub dsh_version: Option<String>,
    pub node_min_version: Option<String>,
    pub entry: Option<String>,
    pub platform: Option<String>,
    pub arch: Option<String>,
}

/// Metadata for one GitHub release asset.
#[derive(Debug, Clone)]
pub struct ReleaseAsset {
    pub name: String,
    /// `sha256:...` digest reported by the GitHub release.
    pub digest: Option<String>,
    pub browser_download_url: String,
}

/// Installs and validates the packaged harness into the app data directory.
pub struct DshInstaller {
    platform: String,
    arch: String,
    app_data_dir: PathBuf,
}

impl DshInstaller {
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> DshResult<Self> {
        let platform = match env::consts::OS {
            "windows" => "windows",
            "macos" => "macos",
            "linux" => "linux",
            other => return Err(DshError::Config(format!("unsupported OS: {other}"))),
        };
        let arch = match env::consts::ARCH {
            "x86_64" => "x64",
            "aarch64" => "arm64",
            other => return Err(DshError::Config(format!("unsupported arch: {other}"))),
        };
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| DshError::Path(e.to_string()))?;
        Ok(Self { platform: platform.to_string(), arch: arch.to_string(), app_data_dir })
    }

    pub fn asset_name(&self) -> String {
        pkg_asset_name(&self.platform, &self.arch)
    }

    pub fn zip_path(&self) -> PathBuf {
        self.app_data_dir.join(self.asset_name())
    }

    pub fn core_dir(&self) -> PathBuf {
        self.app_data_dir.join(DSH_CORE_DIR)
    }

    /// Candidate download URLs: direct GitHub release first, proxy fallback.
    pub fn download_urls(&self) -> Vec<String> {
        let direct = format!("{}/{}", PKG_DOWNLOAD_BASE_URL, self.asset_name());
        vec![direct.clone(), format!("{GH_PROXY_PREFIX}{direct}")]
    }

    /// The dsh CLI entry inside the extracted package.
    pub fn entry_path(&self) -> PathBuf {
        match self.read_manifest().ok().and_then(|m| m.dsh).and_then(|d| d.entry) {
            Some(entry) if !entry.is_empty() => self.core_dir().join(entry),
            _ => self.core_dir().join(DSH_ENTRY_RELATIVE),
        }
    }

    pub fn is_installed(&self) -> bool {
        self.entry_path().exists()
    }

    /// Read the harness manifest embedded in the extracted package.
    pub fn read_manifest(&self) -> DshResult<DshManifest> {
        let manifest_path = self.core_dir().join(DSH_MANIFEST_RELATIVE);
        let content = fs::read_to_string(&manifest_path).map_err(|e| {
            DshError::Config(format!("{}: {e}", i18n::t("harness.manifest_invalid")))
        })?;
        serde_json::from_str(&content)
            .map_err(|e| DshError::Config(format!("{}: {e}", i18n::t("harness.manifest_invalid"))))
    }

    /// Resolve the packaged dsh version (used by the UI).
    pub fn dsh_version(&self) -> Option<String> {
        let manifest = self.read_manifest().ok()?;
        if let Some(version) = manifest.dsh.as_ref().and_then(|d| d.dsh_version.clone()) {
            return Some(version);
        }
        manifest
            .dependencies
            .as_ref()
            .and_then(|deps| deps.get("@deepseek-ai/dsh").cloned())
            .map(|value| value.trim_start_matches(['^', '~', '=', '>', '<']).to_string())
    }

    /// Minimum Node.js version required by the packaged harness.
    pub fn node_min_version(&self) -> String {
        self.read_manifest()
            .ok()
            .and_then(|m| m.dsh)
            .and_then(|d| d.node_min_version)
            .unwrap_or_else(|| MINIMUM_NODE_VERSION.to_string())
    }

    /// Download the harness package zip (when needed, after hash verification).
    pub async fn download_package<R: Runtime>(
        &self,
        tracker: &super::progress::ProgressTracker<'_, R>,
    ) -> DshResult<()> {
        println!("[dsh] installing harness package: {}", self.asset_name());

        let remote_sha = fetch_latest_asset(&self.platform, &self.arch).await?;
        if self.should_download(remote_sha.as_deref())? {
            let buffer = super::progress::tracked_download(tracker, &self.download_urls())
                .await
                .map_err(DshError::Installation)?;
            if let Some(parent) = self.zip_path().parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&self.zip_path(), &buffer)?;
            println!("[dsh] harness package downloaded: {} bytes", buffer.len());
        }
        Ok(())
    }

    fn should_download(&self, remote_sha: Option<&str>) -> DshResult<bool> {
        let path = self.zip_path();
        if !path.exists() {
            return Ok(true);
        }
        let Some(remote_hash) = remote_sha else {
            // No remote hash available: trust the local zip.
            return Ok(false);
        };

        let local_hash = calculate_file_sha256(&path)?;
        if local_hash == remote_hash {
            println!("[dsh] local archive verified, skipping download");
            Ok(false)
        } else {
            println!(
                "[dsh] hash mismatch (local {local_hash} != remote {remote_hash}), re-downloading"
            );
            let _ = fs::remove_file(&path);
            Ok(true)
        }
    }

    pub fn clean_and_extract(&self) -> DshResult<()> {
        let final_dir = self.core_dir();
        if final_dir.exists() {
            fs::remove_dir_all(&final_dir)?;
        }
        fs::create_dir_all(&final_dir)?;
        extract_zip_file(&self.zip_path(), &final_dir)?;
        Ok(())
    }
}

/// The release asset name for a platform/architecture pair.
pub fn pkg_asset_name(platform: &str, arch: &str) -> String {
    let suffix = match (platform, arch) {
        ("windows", _) => "windows".to_string(),
        ("macos", "x86_64") => "macos-x64".to_string(),
        ("macos", "aarch64") => "macos-arm64".to_string(),
        ("linux", _) => "linux".to_string(),
        _ => format!("{platform}-{arch}"),
    };
    format!("deepseek-harness-pkg-{suffix}.zip")
}

/// Fetch the release metadata for the packaged harness and find the asset that
/// matches the current platform/architecture.
pub async fn fetch_latest_asset(platform: &str, arch: &str) -> DshResult<Option<String>> {
    let target = pkg_asset_name(platform, arch);
    let client = reqwest::Client::new();
    let response = client
        .get(PKG_GITHUB_API_URL)
        .header("User-Agent", PKG_GITHUB_USER_AGENT)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?;

    if !response.status().is_success() {
        println!("[dsh] GitHub API returned {}; skipping hash verification", response.status());
        return Ok(None);
    }

    let json: serde_json::Value = response.json().await?;
    let assets = json["assets"].as_array();
    let Some(assets) = assets else {
        return Ok(None);
    };

    for asset in assets {
        if asset["name"].as_str() == Some(target.as_str()) {
            return Ok(asset["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(String::from));
        }
    }

    println!("[dsh] asset {target} not found in the release; skipping hash verification");
    Ok(None)
}

/// Extract a zip archive safely (no path traversal).
fn extract_zip_file(archive_path: &Path, target_dir: &Path) -> DshResult<()> {
    let file = fs::File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| DshError::Installation(format!("invalid zip archive: {e}")))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| DshError::Installation(format!("read zip entry failed: {e}")))?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p)?;
            }
            let mut outfile = fs::File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

pub fn calculate_file_sha256(file_path: &Path) -> DshResult<String> {
    let mut file = fs::File::open(file_path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];
    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
