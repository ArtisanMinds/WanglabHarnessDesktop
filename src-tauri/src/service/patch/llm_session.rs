//! OpenCode Go 会话标识头补丁：让 pi-ai 适配器把当前会话 ID 发到 provider 请求头。
//!
//! OpenCode Go 要求客户端为每段对话发送稳定的会话 ID，否则直接拒绝请求
//! （`400 MissingSessionID`）；官方认可 Harness 原生头 `x-deepseek-harness-session-id`。
//! 上游 `@deepseek-ai/dsh-llm-deepseek` 直连适配器已会发送该头，但 pi-ai 适配器的
//! `requestHeaders(headers)` 把调用里的 `sessionId` 丢掉了，只有透传给 SDK、不落成头，
//! 于是走 pi-ai 的 OpenCode Go 一律 400。本补丁把请求头生成改为接收并使用当前会话 ID，
//! 与 DeepSeek 适配器及 OpenCode Go 识别的头对齐。
//!
//! 幂等与容错：锚点是带 tab 的两处压缩产物片段；上游补上该头后第二处调用点会变化，
//! 锚点缺失即安全跳过（`patch_dsh` 静默降级），不阻断启动。

use crate::utils::{patch_dsh, PatchOutcome};

const PATCH_MARKER: &str = "dsh-tauri-desktop: OpenCode Go session header";

/// 相对活动核心安装目录的 pi-ai 适配器包内路径。
const PI_AI_INDEX_JS: &str = "node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js";

/// `requestHeaders` 定义：单参数 + 直接取 attribution。
const HEADERS_ANCHOR: &str =
    "function requestHeaders(headers) {\n\tconst attribution = attributionHeaders();";
/// 改为接收 `sessionId`，并把会话头并入 attribution（reserved 集合据此覆盖配置里的同名头）。
const HEADERS_PATCHED: &str = "/* dsh-tauri-desktop: OpenCode Go session header */\nfunction requestHeaders(headers, sessionId) {\n\tconst attribution = {\n\t\t...attributionHeaders(),\n\t\t...sessionId === void 0 ? {} : { \"x-deepseek-harness-session-id\": String(sessionId) }\n\t};";

/// 适配器调用点：只透传 profile 配置头。
const CALL_ANCHOR: &str = "headers: requestHeaders(profile.headers)";
/// 把当前调用的 sessionId 一并传入。
const CALL_PATCHED: &str = "headers: requestHeaders(profile.headers, options.sessionId)";

fn patch_source(source: &str) -> PatchOutcome {
    if source.contains(PATCH_MARKER) {
        return PatchOutcome::AlreadyPatched;
    }
    if !source.contains(HEADERS_ANCHOR) || !source.contains(CALL_ANCHOR) {
        return PatchOutcome::AnchorMissing;
    }
    let patched = source
        .replacen(HEADERS_ANCHOR, HEADERS_PATCHED, 1)
        .replacen(CALL_ANCHOR, CALL_PATCHED, 1);
    PatchOutcome::Patched(patched)
}

/// 对活动核心的 dsh-llm-pi-ai `lib/index.js` 应用补丁（幂等）。
/// 返回 Err 表示读/写失败；文件缺失、已打过、锚点变更均静默跳过（Ok）。
pub fn apply(app_handle: &tauri::AppHandle) -> Result<(), String> {
    patch_dsh(app_handle, PI_AI_INDEX_JS, patch_source)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        format!("{HEADERS_ANCHOR}\n\tconst reserved = 1;\n\treturn headers;\n}}\n\t\t\t\t\t{CALL_ANCHOR}\n")
    }

    #[test]
    fn sends_session_header_and_passes_session_id() {
        let PatchOutcome::Patched(patched) = patch_source(&fixture()) else {
            panic!("expected patch")
        };
        assert!(patched.contains("\"x-deepseek-harness-session-id\": String(sessionId)"));
        assert!(patched.contains("function requestHeaders(headers, sessionId) {"));
        assert!(patched.contains("requestHeaders(profile.headers, options.sessionId)"));
        assert!(patched.contains(PATCH_MARKER));
    }

    #[test]
    fn patch_is_idempotent() {
        let PatchOutcome::Patched(patched) = patch_source(&fixture()) else {
            panic!("expected patch")
        };
        assert_eq!(patch_source(&patched), PatchOutcome::AlreadyPatched);
    }

    #[test]
    fn missing_headers_anchor_is_skipped() {
        assert_eq!(patch_source(CALL_ANCHOR), PatchOutcome::AnchorMissing);
    }

    #[test]
    fn missing_call_anchor_is_skipped() {
        assert_eq!(patch_source(HEADERS_ANCHOR), PatchOutcome::AnchorMissing);
    }
}
