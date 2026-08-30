//! Wanglab 本地化默认配置。
//!
//! 只在全新安装时创建当前上游格式的配置；已有文件保持不变。

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
      baseURL: https://10.201.2.89:31415/v1
    anthropic:
      displayName: WanglabAI - Claude
      apiKeyEnv: WANGLABAI_CLAUDE_API_KEY
      baseURL: https://10.201.2.89:31416
    deepseek:
      displayName: WanglabAI - Deepseek
      apiKeyEnv: WANGLABAI_DEEPSEEK_API_KEY
      baseURL: https://10.201.2.89:31417/v1
"#;

const CREDENTIALS: &str = r#"version: 1
refs:
  WANGLABAI_OPENAI_API_KEY: sk-wanglabai
  WANGLABAI_CLAUDE_API_KEY: sk-wanglabai-claude
  WANGLABAI_DEEPSEEK_API_KEY: sk-wanglabai-deepseek
"#;

/// 创建全新安装所需的本地默认文件；已有文件不覆盖。
pub fn apply(app_handle: &AppHandle) -> Result<(), String> {
    let home = config::get_dsh_data_path(app_handle);
    fs::create_dir_all(&home).map_err(|e| format!("create dsh home failed: {e}"))?;
    create_if_missing(&home.join("settings.yaml"), SETTINGS, false)?;
    create_if_missing(&home.join(".credentials.yaml"), CREDENTIALS, true)
}

fn create_if_missing(path: &Path, contents: &str, _private: bool) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    if _private {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(()),
        Err(error) => return Err(format!("create {} failed: {error}", path.display())),
    };

    file.write_all(contents.as_bytes())
        .map_err(|e| format!("write {} failed: {e}", path.display()))
}
