//! Wanglab 本地化默认路由。
//!
//! 这里只给官方 dsh 配置补上本地部署的地址和凭据引用。模型目录、请求协议和
//! 其它 dsh 设置仍由上游 `llm-pi-ai` 负责；已有用户配置永远优先。

use serde_yaml::{Mapping, Value};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

use crate::config;

struct Route {
    id: &'static str,
    display_name: &'static str,
    key_env: &'static str,
    base_url: &'static str,
    key: &'static str,
}

const ROUTES: &[Route] = &[
    Route {
        id: "openai",
        display_name: "WanglabAI - OpenAI",
        key_env: "WANGLABAI_OPENAI_API_KEY",
        base_url: "https://10.201.2.89:31415/v1",
        key: "sk-wanglabai",
    },
    Route {
        id: "anthropic",
        display_name: "WanglabAI - Claude",
        key_env: "WANGLABAI_CLAUDE_API_KEY",
        base_url: "https://10.201.2.89:31416",
        key: "sk-wanglabai-claude",
    },
    Route {
        id: "deepseek",
        display_name: "WanglabAI - Deepseek",
        key_env: "WANGLABAI_DEEPSEEK_API_KEY",
        base_url: "https://10.201.2.89:31417/v1",
        key: "sk-wanglabai-deepseek",
    },
];

/// 补齐 Wanglab 默认配置。函数幂等，并且只写入缺失的键。
pub fn apply(app_handle: &AppHandle) -> Result<(), String> {
    let home = config::get_dsh_data_path(app_handle);
    fs::create_dir_all(&home).map_err(|e| format!("create dsh home failed: {e}"))?;
    patch_settings(&home.join("settings.yaml"))?;
    patch_credentials(&home.join(".credentials.yaml"))
}

fn read_yaml_mapping(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Mapping(Mapping::new()));
    }
    let text = fs::read_to_string(path).map_err(|e| format!("read {} failed: {e}", path.display()))?;
    if text.trim().is_empty() {
        return Ok(Value::Mapping(Mapping::new()));
    }
    serde_yaml::from_str(&text).map_err(|e| format!("parse {} failed: {e}", path.display()))
}

fn mapping_mut<'a>(value: &'a mut Value, path: &Path) -> Result<&'a mut Mapping, String> {
    value
        .as_mapping_mut()
        .ok_or_else(|| format!("{} must contain a YAML mapping", path.display()))
}

fn string_key(value: &str) -> Value {
    Value::String(value.to_string())
}

fn patch_settings(path: &Path) -> Result<(), String> {
    let mut document = read_yaml_mapping(path)?;
    let root = mapping_mut(&mut document, path)?;
    let mut changed = false;
    if !root.contains_key(&string_key("llm-pi-ai")) {
        root.insert(string_key("llm-pi-ai"), Value::Mapping(Mapping::new()));
        changed = true;
    }
    let llm = root
        .get_mut(&string_key("llm-pi-ai"))
        .expect("llm-pi-ai inserted or already present");
    let llm_map = mapping_mut(llm, path)?;
    if !llm_map.contains_key(&string_key("providers")) {
        llm_map.insert(string_key("providers"), Value::Mapping(Mapping::new()));
        changed = true;
    }
    let providers = llm_map
        .get_mut(&string_key("providers"))
        .expect("providers inserted or already present");
    let providers_map = mapping_mut(providers, path)?;

    for route in ROUTES {
        if !providers_map.contains_key(&string_key(route.id)) {
            providers_map.insert(string_key(route.id), Value::Mapping(Mapping::new()));
            changed = true;
        }
        let provider = providers_map
            .get_mut(&string_key(route.id))
            .expect("provider inserted or already present");
        let provider_map = mapping_mut(provider, path)?;
        for (key, value) in [
            ("displayName", route.display_name),
            ("apiKeyEnv", route.key_env),
            ("baseURL", route.base_url),
        ] {
            if !provider_map.contains_key(&string_key(key)) {
                provider_map.insert(string_key(key), Value::String(value.to_string()));
                changed = true;
            }
        }
    }

    if !changed {
        return Ok(());
    }

    fs::write(
        path,
        serde_yaml::to_string(&document).map_err(|e| format!("render {} failed: {e}", path.display()))?,
    )
    .map_err(|e| format!("write {} failed: {e}", path.display()))
}

fn patch_credentials(path: &Path) -> Result<(), String> {
    let mut document = read_yaml_mapping(path)?;
    let root = mapping_mut(&mut document, path)?;
    let mut changed = false;
    let version_key = string_key("version");
    let refs_key = string_key("refs");
    let versioned = root
        .get(&version_key)
        .and_then(Value::as_i64)
        .map(|version| version == 1)
        .unwrap_or(false);
    if root.contains_key(&version_key) && !versioned {
        return Err(format!(
            "{} has an unsupported credentials document version",
            path.display()
        ));
    }

    let target = if versioned {
        if !root.contains_key(&refs_key) {
            root.insert(refs_key.clone(), Value::Mapping(Mapping::new()));
            changed = true;
        }
        let refs = root
            .get_mut(&refs_key)
            .expect("refs inserted or already present");
        mapping_mut(refs, path)?
    } else {
        // The current upstream credentials provider recognizes this legacy
        // flat form at boot and migrates it to version 1 itself.
        root
    };

    for route in ROUTES {
        if !target.contains_key(&string_key(route.key_env)) {
            target.insert(
                string_key(route.key_env),
                Value::String(route.key.to_string()),
            );
            changed = true;
        }
    }
    if !changed {
        return Ok(());
    }
    let rendered = serde_yaml::to_string(&document)
        .map_err(|e| format!("render {} failed: {e}", path.display()))?;
    fs::write(path, rendered).map_err(|e| format!("write {} failed: {e}", path.display()))?;

    // credentials-local rejects a POSIX credentials file readable by group or
    // other users. Keep the Desktop-created file on the same boundary as the
    // upstream provider's own atomic writes.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("protect {} failed: {e}", path.display()))?;
    }
    Ok(())
}
