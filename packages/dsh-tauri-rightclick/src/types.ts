/** Host-half shared types for dsh-tauri-rightclick. */

/**
 * 宿主上下文（沿用工作区先例：插件按需解构具体服务）。
 *
 * 结构化 any 而非核心的 `HostContext`：宿主服务的完整类型由各内核版本自带，
 * 本插件只消费已核实存在的成员（`logger`），避免把某一版的类型钉进构建。
 * 处理器里经 `dshContextOf(event) as unknown as HostContext` 取回（与核心正例同形）。
 */
export type HostContext = any
