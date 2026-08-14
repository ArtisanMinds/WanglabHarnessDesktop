//! Constants shared by the harness setup/launch pipeline.

use std::time::Duration;

/// Bundled Node.js runtime version. Satisfies the harness requirement of
/// v22.15.0+ / v23.8.0+ and the upstream `@deepseek-ai/dsh` engines
/// (`^22.19.0 || >=24.0.0`).
pub const NODEJS_VERSION: &str = "v22.22.0";

/// Lowest Node.js version accepted by the packaged harness.
pub const MINIMUM_NODE_VERSION: &str = "22.15.0";

/// Official Node.js download base.
pub const NODEJS_BASE_URL: &str = "https://nodejs.org/dist/";

/// npmmirror (Taobao) Node.js mirror, used as a fallback for slow networks.
pub const NODEJS_NPMMIRROR_URL: &str = "https://npmmirror.com/mirrors/node/";

/// Host the harness web server binds to.
pub const DSH_SERVICE_HOST: &str = "127.0.0.1";

/// Default harness web server port (dsh default: 3080).
pub const DSH_SERVICE_PORT: &str = "3080";

/// Directory (under the app data dir) used as the isolated `$DSH_HOME`.
pub const DSH_HOME_DIR_NAME: &str = "dsh-home";

/// DeepSeek Harness packaged distribution release feed (GitHub API).
pub const PKG_GITHUB_API_URL: &str =
    "https://api.github.com/repos/hairyf/deepseek-harness-pkg/releases/latest";

/// User-Agent used for GitHub API requests.
pub const PKG_GITHUB_USER_AGENT: &str = "deepseek-harness-desktop";

/// Direct asset download base for the packaged harness.
pub const PKG_DOWNLOAD_BASE_URL: &str =
    "https://github.com/hairyf/deepseek-harness-pkg/releases/latest/download";

/// Proxy prefix used as a fallback for GitHub asset downloads.
pub const GH_PROXY_PREFIX: &str = "https://gh-proxy.com/";

/// Directory that holds the extracted harness package (under app data dir).
pub const DSH_CORE_DIR: &str = "dsh-core";

/// Relative path of the `dsh` CLI entry inside the harness package.
pub const DSH_ENTRY_RELATIVE: &str = "node_modules/@deepseek-ai/dsh/lib/bin.js";

/// Relative path of the harness package manifest inside the harness package.
pub const DSH_MANIFEST_RELATIVE: &str = "package.json";

/// Health-check timeouts for the harness web server.
pub const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
pub const HEALTH_CHECK_RETRIES: usize = 3;
pub const HEALTH_CHECK_RETRY_DELAY: Duration = Duration::from_millis(500);

/// Build the health-check endpoints for a given port.
pub fn health_check_endpoints(port: u16) -> Vec<String> {
    vec![
        format!("http://127.0.0.1:{port}/"),
        format!("http://localhost:{port}/"),
    ]
}

/// Build the service URL (what the webview and user actions use).
pub fn service_url(port: u16) -> String {
    format!("http://{}:{}", DSH_SERVICE_HOST, port)
}
