//! Wanglab 内网路由与实时模型目录；只合并缺失配置，模型只从对应连接取得。

use crate::config;
use serde_yaml::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;

const SETTINGS: &str = r#"llm-pi-ai:
  providers:
    openai:
      displayName: WanglabAI - OpenAI
      apiKeyEnv: WANGLABAI_OPENAI_API_KEY
      api: openai-responses
      baseURL: https://10.201.2.89:31415/v1
      models: []
    anthropic:
      displayName: WanglabAI - Claude
      apiKeyEnv: WANGLABAI_CLAUDE_API_KEY
      api: anthropic-messages
      baseURL: https://10.201.2.89:31416
      models: []
    xai:
      displayName: WanglabAI - Grok
      apiKeyEnv: WANGLABAI_GROK_API_KEY
      api: openai-responses
      baseURL: https://10.201.2.89:31418/v1
      models: []
llm-deepseek:
  apiKeyEnv: WANGLABAI_DEEPSEEK_API_KEY
  baseURL: https://10.201.2.89:31417/v1
  models: []
web-search-deepseek:
  apiKeyEnv: WANGLABAI_DEEPSEEK_API_KEY
  baseURL: https://10.201.2.89:31417/anthropic/v1
  model: deepseek-v4-flash
"#;

const CREDENTIALS: &str = r#"version: 1
refs:
  WANGLABAI_OPENAI_API_KEY: sk-wanglabai
  WANGLABAI_CLAUDE_API_KEY: sk-wanglabai-claude
  WANGLABAI_DEEPSEEK_API_KEY: sk-wanglabai-deepseek
  WANGLABAI_GROK_API_KEY: sk-wanglabai-grok
records: {}
"#;

const ROUTES: &[(&str, &str)] = &[
    ("openai", "https://10.201.2.89:31415/v1"),
    ("anthropic", "https://10.201.2.89:31416"),
    ("xai", "https://10.201.2.89:31418/v1"),
    ("deepseek", "https://10.201.2.89:31417/v1"),
];

pub fn apply(app_handle: &AppHandle) -> Result<(), String> {
    let home = config::get_dsh_data_path(app_handle);
    apply_to(&home)
}

fn apply_to(home: &Path) -> Result<(), String> {
    fs::create_dir_all(home).map_err(|e| format!("LOCAL_DEFAULTS_HOME_FAILED: {e}"))?;
    for (name, defaults, private) in [
        ("settings.yaml", SETTINGS, false),
        (".credentials.yaml", CREDENTIALS, true),
    ] {
        let path = home.join(name);
        let defaults: Value =
            serde_yaml::from_str(defaults).map_err(|e| format!("LOCAL_DEFAULTS_PARSE: {e}"))?;
        let mut value = if path.exists() {
            read_yaml(&path)?
        } else {
            Value::Mapping(Default::default())
        };
        let before = value.clone();
        merge_missing(&mut value, &defaults);
        if before != value {
            write_yaml(&path, &value, private)?;
        }
    }
    Ok(())
}

fn merge_missing(value: &mut Value, defaults: &Value) {
    if let (Some(value), Some(defaults)) = (value.as_mapping_mut(), defaults.as_mapping()) {
        for (key, default) in defaults {
            match value.get_mut(key) {
                Some(existing) => merge_missing(existing, default),
                None => {
                    value.insert(key.clone(), default.clone());
                }
            }
        }
    }
}

fn read_yaml(path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("LOCAL_DEFAULTS_READ: {e}"))?;
    serde_yaml::from_str(&raw).map_err(|e| format!("LOCAL_DEFAULTS_PARSE: {}: {e}", path.display()))
}

fn write_yaml(path: &Path, value: &Value, private: bool) -> Result<(), String> {
    let contents =
        serde_yaml::to_string(value).map_err(|e| format!("LOCAL_DEFAULTS_SERIALIZE: {e}"))?;
    let backup = path.with_extension("yaml.before-wanglab-0.2.0");
    if path.exists() && !backup.exists() {
        fs::copy(path, &backup).map_err(|e| format!("LOCAL_DEFAULTS_BACKUP: {e}"))?;
    }
    let tmp = path.with_extension("yaml.wanglab.tmp");
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    #[cfg(windows)]
    let _ = private;
    let mut file = options
        .open(&tmp)
        .map_err(|e| format!("LOCAL_DEFAULTS_WRITE: {e}"))?;
    file.write_all(contents.as_bytes())
        .map_err(|e| format!("LOCAL_DEFAULTS_WRITE: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("LOCAL_DEFAULTS_SYNC: {e}"))?;
    drop(file);
    fs::rename(&tmp, path).map_err(|e| format!("LOCAL_DEFAULTS_RENAME: {e}"))
}

fn route<'a>(settings: &'a Value, provider: &str) -> &'a Value {
    if provider == "deepseek" {
        &settings["llm-deepseek"]
    } else {
        &settings["llm-pi-ai"]["providers"][provider]
    }
}

fn route_mut<'a>(settings: &'a mut Value, provider: &str) -> &'a mut Value {
    if provider == "deepseek" {
        &mut settings["llm-deepseek"]
    } else {
        &mut settings["llm-pi-ai"]["providers"][provider]
    }
}

/// 启动前并行刷新四条连接；断网保留上次成功目录，不使用内置型号兜底。
pub async fn refresh_models(app_handle: &AppHandle) -> Result<(), String> {
    let home = config::get_dsh_data_path(app_handle);
    apply_to(&home)?;
    let path = home.join("settings.yaml");
    let snapshot = read_yaml(&path)?;
    let credentials = read_yaml(&home.join(".credentials.yaml"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("MODEL_CATALOG_CLIENT: {e}"))?;
    let requests = ROUTES.iter().map(|(provider, base)| {
        let current = route(&snapshot, provider);
        let configured = current["baseURL"].as_str() == Some(base);
        let key_ref = current["apiKeyEnv"].as_str().unwrap_or_default();
        let key = std::env::var(key_ref).ok().or_else(|| credentials["refs"][key_ref].as_str().map(str::to_owned));
        let client = client.clone();
        async move {
            if !configured { return (*provider, *base, None); }
            let Some(key) = key else { return (*provider, *base, None); };
            let url = if *provider == "anthropic" { format!("{base}/v1/models") } else { format!("{base}/models") };
            let result = async {
                let response = client.get(url).bearer_auth(key).send().await
                    .map_err(|e| format!("MODEL_CATALOG_REQUEST: {e}"))?
                    .error_for_status().map_err(|e| format!("MODEL_CATALOG_STATUS: {e}"))?;
                let body: serde_json::Value = response.json().await.map_err(|e| format!("MODEL_CATALOG_JSON: {e}"))?;
                body["data"].as_array().cloned().ok_or_else(|| "MODEL_CATALOG_INVALID: missing data array".to_string())
            }.await;
            match result {
                Ok(models) => (*provider, *base, Some(models)),
                Err(error) => {
                    log::warn!("Model refresh failed for {provider}, retaining last successful catalog: {error}");
                    (*provider, *base, None)
                }
            }
        }
    });
    let results = futures_util::future::join_all(requests).await;
    let mut settings = read_yaml(&path)?;
    let before = settings.clone();
    for (provider, base, models) in results {
        let current = route_mut(&mut settings, provider);
        if current["baseURL"].as_str() != Some(base) {
            continue;
        }
        if let Some(models) = models {
            current["models"] = reconcile_models(provider, &current["models"], &models);
        }
    }
    if settings != before {
        write_yaml(&path, &settings, false)?;
    }
    Ok(())
}

fn reconcile_models(provider: &str, previous: &Value, remote: &[serde_json::Value]) -> Value {
    let old = previous.as_sequence().cloned().unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let models = remote
        .iter()
        .filter_map(|model| {
            let id = model["id"].as_str().filter(|id| !id.is_empty())?;
            if !seen.insert(id.to_string()) {
                return None;
            }
            let mut value = old
                .iter()
                .find(|entry| entry["id"].as_str() == Some(id))
                .cloned()
                .unwrap_or_else(|| Value::Mapping(Default::default()));
            value["id"] = Value::String(id.to_string());
            for (target, source) in [
                ("contextWindow", "context_window"),
                ("maxTokens", "max_output_tokens"),
            ] {
                if let Some(number) = model[source].as_u64().filter(|n| *n > 0) {
                    value[target] = Value::Number(number.into());
                }
            }
            if provider == "deepseek" && id.starts_with("deepseek-v4-") {
                if value["contextWindow"].is_null() {
                    value["contextWindow"] = Value::Number(1_000_000u64.into());
                }
                if id.contains("vision") {
                    value["inputModalities"] = serde_yaml::to_value(["text", "image"]).ok()?;
                }
            }
            Some(value)
        })
        .collect();
    Value::Sequence(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_preserves_user_settings_and_adds_independent_grok_route() {
        let mut settings: Value = serde_yaml::from_str("llm-pi-ai:\n  providers:\n    openai:\n      baseURL: https://custom.invalid/v1\n      models: [{id: user-model}]\ncustom: keep\n").unwrap();
        merge_missing(&mut settings, &serde_yaml::from_str(SETTINGS).unwrap());
        assert_eq!(
            settings["llm-pi-ai"]["providers"]["openai"]["baseURL"],
            "https://custom.invalid/v1"
        );
        assert_eq!(
            settings["llm-pi-ai"]["providers"]["openai"]["models"][0]["id"],
            "user-model"
        );
        assert_eq!(
            settings["llm-pi-ai"]["providers"]["xai"]["api"],
            "openai-responses"
        );
        assert_eq!(settings["custom"], "keep");
        let credentials: Value = serde_yaml::from_str(CREDENTIALS).unwrap();
        let refs = credentials["refs"].as_mapping().unwrap();
        let keys: std::collections::HashSet<_> =
            refs.values().map(|value| value.as_str().unwrap()).collect();
        assert_eq!(keys.len(), 4);
    }

    #[test]
    fn refresh_removes_retired_models_and_preserves_metadata_for_returned_models() {
        let previous: Value =
            serde_yaml::from_str("[{id: retired}, {id: returned, contextWindow: 99999}]").unwrap();
        let remote = vec![
            serde_json::json!({"id":"returned"}),
            serde_json::json!({"id":"new-model"}),
            serde_json::json!({"id":"returned"}),
        ];
        let result = reconcile_models("openai", &previous, &remote);
        assert_eq!(result.as_sequence().unwrap().len(), 2);
        assert_eq!(result[0]["contextWindow"].as_u64(), Some(99999));
        assert_eq!(result[1]["id"], "new-model");
        assert_eq!(
            reconcile_models("openai", &previous, &[]),
            Value::Sequence(vec![])
        );
    }
}
