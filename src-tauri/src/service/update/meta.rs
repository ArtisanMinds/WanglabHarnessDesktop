//! Wanglab Desktop 更新清单读取。

use std::time::Duration;

use serde::Deserialize;

use super::version::{current_version, is_newer, is_stable, parse_version, pick_asset};
use super::UPDATE_MANIFEST_URL;

#[derive(Debug, Clone)]
pub(super) struct LatestRelease {
    pub(super) version: String,
    pub(super) tag: String,
    pub(super) published_at: String,
    pub(super) url: String,
    pub(super) asset_name: String,
    pub(super) digest: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseManifest {
    version: String,
    tag: String,
    published_at: String,
    assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    url: String,
    #[serde(default)]
    digest: Option<String>,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("wanglab-harness-desktop")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| format!("UPDATE_CLIENT: {error}"))
}

async fn fetch_manifest() -> Result<ReleaseManifest, String> {
    http_client()?
        .get(UPDATE_MANIFEST_URL)
        .send()
        .await
        .map_err(|error| format!("UPDATE_MANIFEST: {error}"))?
        .error_for_status()
        .map_err(|error| format!("UPDATE_MANIFEST: {error}"))?
        .json::<ReleaseManifest>()
        .await
        .map_err(|error| format!("UPDATE_MANIFEST: {error}"))
}

pub(super) async fn fetch_releases_meta() -> Result<Vec<(String, String)>, String> {
    let manifest = fetch_manifest().await?;
    Ok(vec![(manifest.tag, manifest.published_at)])
}

fn release_from_manifest(
    manifest: ReleaseManifest,
    current: &str,
) -> Result<Option<LatestRelease>, String> {
    let parsed = parse_version(&manifest.version)
        .ok_or_else(|| format!("UPDATE_MANIFEST: invalid version {}", manifest.version))?;
    if !is_stable(&parsed) || !is_newer(&manifest.version, current) {
        return Ok(None);
    }

    let names = manifest
        .assets
        .iter()
        .map(|asset| asset.name.clone())
        .collect::<Vec<_>>();
    let Some(asset_name) = pick_asset(&names) else {
        return Ok(None);
    };
    let asset = manifest
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| "UPDATE_MANIFEST: selected asset is missing".to_string())?;

    Ok(Some(LatestRelease {
        version: manifest.version,
        tag: manifest.tag,
        published_at: manifest.published_at,
        url: asset.url,
        asset_name: asset.name,
        digest: asset.digest,
    }))
}

pub(super) async fn fetch_latest_release() -> Result<Option<LatestRelease>, String> {
    release_from_manifest(fetch_manifest().await?, &current_version())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn platform_asset() -> &'static str {
        #[cfg(target_os = "windows")]
        return "Wanglab Harness Desktop_0.1.1_x64-setup.exe";
        #[cfg(target_os = "macos")]
        return "Wanglab Harness Desktop_0.1.1_x64.dmg";
        #[cfg(target_os = "linux")]
        return "wanglab-harness-desktop_0.1.1_amd64.deb";
    }

    #[test]
    fn manifest_selects_the_current_platform_asset() {
        let manifest = ReleaseManifest {
            version: "0.1.1".to_string(),
            tag: "v0.1.1".to_string(),
            published_at: "2026-08-31T00:00:00Z".to_string(),
            assets: vec![ReleaseAsset {
                name: platform_asset().to_string(),
                url: "https://seuwanglab.com/downloads/app".to_string(),
                digest: Some(format!("sha256:{}", "a".repeat(64))),
            }],
        };

        let release = release_from_manifest(manifest, "0.1.0")
            .expect("valid manifest")
            .expect("new release");
        assert_eq!(release.version, "0.1.1");
        assert_eq!(release.asset_name, platform_asset());
    }

    #[test]
    fn manifest_does_not_offer_the_current_version() {
        let manifest = ReleaseManifest {
            version: "0.1.0".to_string(),
            tag: "v0.1.0".to_string(),
            published_at: "2026-08-31T00:00:00Z".to_string(),
            assets: vec![ReleaseAsset {
                name: platform_asset().to_string(),
                url: "https://seuwanglab.com/downloads/app".to_string(),
                digest: None,
            }],
        };

        assert!(release_from_manifest(manifest, "0.1.0")
            .expect("valid manifest")
            .is_none());
    }
}
