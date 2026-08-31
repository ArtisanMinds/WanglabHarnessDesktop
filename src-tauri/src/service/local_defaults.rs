//! Wanglab 首次启动配置。
//!
//! 只在配置文件不存在时写入本地部署的三条路由；已有用户文件原样保留。

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use tauri::AppHandle;

use crate::config;

const SETTINGS: &str = r#"llm-pi-ai:
  providers:
    openai:
      displayName: WanglabAI - OpenAI
      apiKeyEnv: WANGLABAI_OPENAI_API_KEY
      api: openai-responses
      baseURL: https://10.201.2.89:31415/v1
      models:
        - id: gpt-5.6-sol
        - id: gpt-5.6-terra
        - id: gpt-5.6-luna
        - id: gpt-5.5
        - id: gpt-5.2
    anthropic:
      displayName: WanglabAI - Claude
      apiKeyEnv: WANGLABAI_CLAUDE_API_KEY
      api: anthropic-messages
      baseURL: https://10.201.2.89:31416
      models:
        - id: claude-haiku-4-5-20251001
        - id: claude-opus-5
        - id: claude-sonnet-5
llm-deepseek:
  apiKeyEnv: WANGLABAI_DEEPSEEK_API_KEY
  baseURL: https://10.201.2.89:31417/v1
  models:
    - id: deepseek-v4-flash
      name: DeepSeek-V4-Flash
      contextWindow: 1000000
    - id: deepseek-v4-pro
      name: DeepSeek-V4-Pro
      contextWindow: 1000000
    - id: deepseek-v4-flash-vision-exp
      name: DeepSeek-V4-Flash-Vision-Exp
      contextWindow: 1000000
      inputModalities:
        - text
        - image
"#;

const CREDENTIALS: &str = r#"version: 1
refs:
  WANGLABAI_OPENAI_API_KEY: sk-wanglabai
  WANGLABAI_CLAUDE_API_KEY: sk-wanglabai-claude
  WANGLABAI_DEEPSEEK_API_KEY: sk-wanglabai-deepseek
records: {}
"#;

/// 写入首次启动所需的本地配置；文件存在时不覆盖，也不合并或改写用户内容。
pub fn apply(app_handle: &AppHandle) -> Result<(), String> {
    let home = config::get_dsh_data_path(app_handle);
    fs::create_dir_all(&home)
        .map_err(|error| format!("LOCAL_DEFAULTS_HOME_FAILED: {error}"))?;
    create_if_missing(&home.join("settings.yaml"), SETTINGS, false)?;
    create_if_missing(&home.join(".credentials.yaml"), CREDENTIALS, true)
}

fn create_if_missing(path: &Path, contents: &str, private: bool) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(()),
        Err(error) => {
            return Err(format!(
                "LOCAL_DEFAULTS_FILE_FAILED: {}: {error}",
                path.display()
            ))
        }
    };

    file.write_all(contents.as_bytes()).map_err(|error| {
        format!(
            "LOCAL_DEFAULTS_WRITE_FAILED: {}: {error}",
            path.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{CREDENTIALS, SETTINGS};

    #[test]
    fn defaults_use_distinct_routes_and_credential_references() {
        let settings: serde_yaml::Value = serde_yaml::from_str(SETTINGS).expect("settings yaml");
        let providers = settings["llm-pi-ai"]["providers"]
            .as_mapping()
            .expect("pi-ai providers");
        assert!(providers.contains_key(serde_yaml::Value::String("openai".into())));
        assert!(providers.contains_key(serde_yaml::Value::String("anthropic".into())));
        assert!(settings["llm-deepseek"].get("baseURL").is_some());
        assert_eq!(
            settings["llm-pi-ai"]["providers"]["openai"]["models"]
                .as_sequence()
                .unwrap()
                .len(),
            5
        );
        assert_eq!(
            settings["llm-pi-ai"]["providers"]["anthropic"]["api"],
            "anthropic-messages"
        );
        assert_eq!(
            settings["llm-deepseek"]["models"]
                .as_sequence()
                .unwrap()
                .len(),
            3
        );

        let credentials: serde_yaml::Value =
            serde_yaml::from_str(CREDENTIALS).expect("credentials yaml");
        let refs = credentials["refs"].as_mapping().expect("credential refs");
        assert_eq!(refs.len(), 3);
        let openai_ref = serde_yaml::Value::String("WANGLABAI_OPENAI_API_KEY".into());
        let claude_ref = serde_yaml::Value::String("WANGLABAI_CLAUDE_API_KEY".into());
        let deepseek_ref = serde_yaml::Value::String("WANGLABAI_DEEPSEEK_API_KEY".into());
        assert_ne!(
            refs.get(&openai_ref).expect("OpenAI credential"),
            refs.get(&claude_ref).expect("Claude credential")
        );
        assert_ne!(
            refs.get(&openai_ref).expect("OpenAI credential"),
            refs.get(&deepseek_ref).expect("DeepSeek credential")
        );
    }
}
