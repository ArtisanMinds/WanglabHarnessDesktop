//! 自托管宠物市场：仅按需读取目录，下载校验后安装到 Harness 自己的数据目录。

use super::pet::{install_harness_pet, installed_harness_pet_ids};
use super::preset_pet::PresetDownloadProgress;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const MARKET_ORIGIN: &str = "https://seuwanglab.com";
const MARKET_PATH: &str = "/downloads/wanglab-harness/pets/";
const CATALOG_URL: &str = "https://seuwanglab.com/downloads/wanglab-harness/pets/catalog.json";
const CATALOG_MAX_BYTES: usize = 1024 * 1024;
const PACKAGE_MAX_BYTES: u64 = 32 * 1024 * 1024;
const CACHE_TTL: Duration = Duration::from_secs(300);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketAuthor {
    pub name: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPet {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: MarketAuthor,
    pub source_url: String,
    pub license: String,
    pub license_url: String,
    pub preview_url: String,
    pub spritesheet_url: String,
    pub sprite_version: u8,
    pub archive_url: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketCatalog {
    pub schema_version: u8,
    pub pets: Vec<MarketPet>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPetListItem {
    #[serde(flatten)]
    pub pet: MarketPet,
    pub installed: bool,
    pub phase: String,
}

fn catalog_cache() -> &'static tokio::sync::Mutex<Option<(Instant, MarketCatalog)>> {
    static CACHE: OnceLock<tokio::sync::Mutex<Option<(Instant, MarketCatalog)>>> = OnceLock::new();
    CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

fn downloads() -> &'static Mutex<HashMap<String, PresetDownloadProgress>> {
    static DOWNLOADS: OnceLock<Mutex<HashMap<String, PresetDownloadProgress>>> = OnceLock::new();
    DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn set_progress(id: &str, progress: PresetDownloadProgress) {
    downloads()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .insert(id.to_string(), progress);
}

fn trusted_asset_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    url.origin().ascii_serialization() == MARKET_ORIGIN
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with(MARKET_PATH)
        && !url.path().contains('%')
        && !value.contains('\\')
}

fn public_source_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}

fn parse_catalog(bytes: &[u8]) -> Result<MarketCatalog, String> {
    let catalog: MarketCatalog = serde_json::from_slice(bytes)
        .map_err(|error| format!("PET_MARKET_CATALOG_INVALID: {error}"))?;
    if catalog.schema_version != 1 || catalog.pets.len() > 500 {
        return Err("PET_MARKET_CATALOG_INVALID: unsupported schema or too many pets".to_string());
    }
    let mut ids = HashSet::new();
    for pet in &catalog.pets {
        if !super::preset_pet::safe_preset_id(&pet.id)
            || !ids.insert(&pet.id)
            || pet.name.trim().is_empty()
            || pet.name.len() > 200
            || pet.description.len() > 4096
            || pet.author.name.trim().is_empty()
            || pet.author.name.len() > 200
            || pet.license.trim().is_empty()
            || pet.license.len() > 120
            || !matches!(pet.sprite_version, 1 | 2)
            || pet.sha256.len() != 64
            || !pet.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
            || pet.size == 0
            || pet.size > PACKAGE_MAX_BYTES
            || ![
                &pet.archive_url,
                &pet.preview_url,
                &pet.spritesheet_url,
                &pet.license_url,
            ]
            .into_iter()
            .all(|url| trusted_asset_url(url))
            || !public_source_url(&pet.source_url)
            || !public_source_url(&pet.author.url)
        {
            return Err(format!(
                "PET_MARKET_CATALOG_INVALID: invalid entry {}",
                pet.id
            ));
        }
    }
    Ok(catalog)
}

fn market_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(concat!("WanglabHarnessDesktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("PET_MARKET_CLIENT_FAILED: {error}"))
}

async fn read_catalog(refresh: bool) -> Result<MarketCatalog, String> {
    let mut cache = catalog_cache().lock().await;
    if !refresh {
        if let Some((saved, catalog)) = cache.as_ref() {
            if saved.elapsed() < CACHE_TTL {
                return Ok(catalog.clone());
            }
        }
    }
    let response = market_client(Duration::from_secs(12))?
        .get(CATALOG_URL)
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|error| format!("PET_MARKET_FETCH_FAILED: {error}"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(format!(
            "PET_MARKET_FETCH_FAILED: HTTP {}",
            response.status()
        ));
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("PET_MARKET_FETCH_FAILED: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) > CATALOG_MAX_BYTES {
            return Err("PET_MARKET_CATALOG_INVALID: catalog exceeds 1 MiB".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    let catalog = parse_catalog(&bytes)?;
    *cache = Some((Instant::now(), catalog.clone()));
    Ok(catalog)
}

#[tauri::command]
pub async fn list_pet_market(
    app: AppHandle,
    refresh: Option<bool>,
) -> Result<Vec<MarketPetListItem>, String> {
    let catalog = read_catalog(refresh.unwrap_or(false)).await?;
    let installed = installed_harness_pet_ids(&app)?;
    let states = downloads()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    Ok(catalog
        .pets
        .into_iter()
        .map(|pet| {
            let phase = states
                .get(&pet.id)
                .map(|state| state.phase.clone())
                .unwrap_or_else(|| "idle".to_string());
            MarketPetListItem {
                installed: installed.contains(&pet.id),
                phase,
                pet,
            }
        })
        .collect())
}

fn verify_package(pet: &MarketPet, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != pet.size {
        return Err(
            "PET_MARKET_SIZE_MISMATCH: download size does not match the catalog".to_string(),
        );
    }
    if format!("{:x}", Sha256::digest(bytes)) != pet.sha256.to_ascii_lowercase() {
        return Err("PET_MARKET_DIGEST_MISMATCH: SHA-256 verification failed".to_string());
    }
    Ok(())
}

async fn install_download(app: AppHandle, pet: MarketPet) -> Result<(), String> {
    let response = market_client(Duration::from_secs(90))?
        .get(&pet.archive_url)
        .send()
        .await
        .map_err(|error| format!("PET_MARKET_DOWNLOAD_FAILED: {error}"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(format!(
            "PET_MARKET_DOWNLOAD_FAILED: HTTP {}",
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size != pet.size)
    {
        return Err(
            "PET_MARKET_SIZE_MISMATCH: response size does not match the catalog".to_string(),
        );
    }
    let mut bytes = Vec::with_capacity(pet.size as usize);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("PET_MARKET_DOWNLOAD_FAILED: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) as u64 > pet.size {
            return Err("PET_MARKET_SIZE_MISMATCH: response exceeded the catalog size".to_string());
        }
        bytes.extend_from_slice(&chunk);
        set_progress(
            &pet.id,
            PresetDownloadProgress {
                phase: "downloading".to_string(),
                received: bytes.len() as u64,
                total: pet.size,
                error: None,
            },
        );
    }
    verify_package(&pet, &bytes)?;
    set_progress(
        &pet.id,
        PresetDownloadProgress {
            phase: "extracting".to_string(),
            received: pet.size,
            total: pet.size,
            error: None,
        },
    );
    tauri::async_runtime::spawn_blocking(move || install_harness_pet(&app, &pet.id, &bytes))
        .await
        .map_err(|error| format!("PET_MARKET_INSTALL_FAILED: {error}"))??;
    Ok(())
}

#[tauri::command]
pub async fn download_market_pet(app: AppHandle, id: String) -> Result<(), String> {
    let catalog = read_catalog(false).await?;
    let pet = catalog
        .pets
        .into_iter()
        .find(|pet| pet.id == id)
        .ok_or_else(|| "PET_MARKET_NOT_FOUND: pet is not in the catalog".to_string())?;
    if installed_harness_pet_ids(&app)?.contains(&id) {
        return Err("PET_ALREADY_IMPORTED: pet is already installed".to_string());
    }
    {
        // 先占用下载槽，避免连续点击或多个设置窗口同时启动同一个下载。
        let mut states = downloads()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if states
            .get(&id)
            .is_some_and(|state| matches!(state.phase.as_str(), "downloading" | "extracting"))
        {
            return Err("PET_MARKET_BUSY: download is already running".to_string());
        }
        states.insert(
            id.clone(),
            PresetDownloadProgress {
                phase: "downloading".to_string(),
                received: 0,
                total: pet.size,
                error: None,
            },
        );
    }
    tauri::async_runtime::spawn(async move {
        let result = install_download(app, pet).await;
        set_progress(
            &id,
            PresetDownloadProgress {
                phase: if result.is_ok() { "done" } else { "failed" }.to_string(),
                received: 0,
                total: 0,
                error: result.err(),
            },
        );
    });
    Ok(())
}

#[tauri::command]
pub fn get_market_pet_progress(id: String) -> PresetDownloadProgress {
    downloads()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&id)
        .cloned()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 1,
            "pets": [{
                "id": "sample", "name": "Sample", "description": "A sample pet",
                "author": { "name": "Original author", "url": "https://example.com/author" },
                "sourceUrl": "https://example.com/pets/sample", "license": "MIT",
                "licenseUrl": format!("{MARKET_ORIGIN}{MARKET_PATH}sample/ATTRIBUTION.md"),
                "previewUrl": format!("{MARKET_ORIGIN}{MARKET_PATH}sample/preview.webp"),
                "spritesheetUrl": format!("{MARKET_ORIGIN}{MARKET_PATH}sample/spritesheet.webp"),
                "spriteVersion": 1,
                "archiveUrl": format!("{MARKET_ORIGIN}{MARKET_PATH}sample/pet.zip"),
                "sha256": format!("{:x}", Sha256::digest(b"package")), "size": 7,
            }]
        })
    }

    #[test]
    fn catalog_preserves_order_and_source_attribution() {
        let mut value = catalog();
        let mut second = value["pets"][0].clone();
        second["id"] = "another".into();
        value["pets"].as_array_mut().unwrap().push(second);
        let parsed = parse_catalog(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(parsed.pets[0].id, "sample");
        assert_eq!(parsed.pets[1].id, "another");
        assert_eq!(parsed.pets[0].author.name, "Original author");
        assert_eq!(parsed.pets[0].license, "MIT");
    }

    #[test]
    fn catalog_rejects_untrusted_downloads_and_duplicate_ids() {
        for url in [
            "https://example.com/pet.zip",
            "http://seuwanglab.com/downloads/wanglab-harness/pets/pet.zip",
            "https://seuwanglab.com/private.zip",
            "https://user@seuwanglab.com/downloads/wanglab-harness/pets/pet.zip",
            "https://seuwanglab.com/downloads/wanglab-harness/pets/%2e%2e/private.zip",
            "https://seuwanglab.com/downloads/wanglab-harness/pets/pet.zip?redirect=1",
        ] {
            let mut value = catalog();
            value["pets"][0]["archiveUrl"] = url.into();
            assert!(
                parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err(),
                "应拒绝 {url}"
            );
        }
        let mut value = catalog();
        let duplicate = value["pets"][0].clone();
        value["pets"].as_array_mut().unwrap().push(duplicate);
        assert!(parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err());
    }

    #[test]
    fn archive_verification_rejects_truncated_and_changed_bytes() {
        let pet = parse_catalog(&serde_json::to_vec(&catalog()).unwrap())
            .unwrap()
            .pets
            .remove(0);
        assert!(verify_package(&pet, b"package").is_ok());
        assert!(verify_package(&pet, b"pack")
            .unwrap_err()
            .starts_with("PET_MARKET_SIZE_MISMATCH:"));
        assert!(verify_package(&pet, b"changed")
            .unwrap_err()
            .starts_with("PET_MARKET_DIGEST_MISMATCH:"));
    }
}
