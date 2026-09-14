/**
 * 补丁层 YAML 语法错误的识别与信息提取（纯函数，便于单测）。
 *
 * Rust 侧 `service::plugin::internal::repair_loader_state` 解析档案层 / home 层的
 * `cordis.patch.yml` 失败时抛出 `INTERNAL_PLUGIN_PATCH_PARSE_FAILED: <路径>: <错误>`
 * （见 `service::plugin::patch_guard` 的模块说明），随后被包成
 * `INTERNAL_PLUGIN_INSTALL_FAILED` 并挂在「Plugin installation 阶段」——用户看到的
 * 是「插件安装失败」，实际原因却是补丁文件写错了（issue #525）。这里把它识别出来，
 * 转成「哪个文件、哪一行、怎么改」的针对性提示与隔离入口。
 */

/** Rust 侧补丁层解析失败的错误码。 */
export const PATCH_PARSE_ERROR_CODE = 'INTERNAL_PLUGIN_PATCH_PARSE_FAILED'

/** 启动失败信息里是否包含补丁层解析失败。 */
export function containsPatchLayerParseError(message: string): boolean {
  return message.includes(`${PATCH_PARSE_ERROR_CODE}:`)
}

/** 提取补丁层解析失败的「路径 + YAML 错误（含行列号）」片段（无则空串）。 */
export function patchLayerErrorDetail(message: string): string {
  const marker = `${PATCH_PARSE_ERROR_CODE}:`
  const at = message.indexOf(marker)
  if (at < 0)
    return ''
  return message.slice(at + marker.length).trim()
}
