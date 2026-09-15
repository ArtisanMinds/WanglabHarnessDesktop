/**
 * routes/mcp/save/post.ts — POST /mcp/save：新增或覆盖一行 MCP 服务器。
 *
 * 行写进 profile 或机器级 patch 层（`scope === 'global'`），恒回报
 * `restartNeeded`。方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由
 * `defineRoutes` 统一承担。
 */

import type { McpInput } from '../../../service/mcp'
import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { mcpScopeDir, normalizeMcpScope, upsertMcp, validateMcpInput } from '../../../service/mcp'

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpInput & { scope?: unknown }>(event, { type: 'json' })
  if (body === undefined) {
    event.res.status = 400
    return { error: 'invalid-body' }
  }
  try {
    const invalid = validateMcpInput(body)
    if (invalid !== null) {
      event.res.status = 400
      return { error: invalid }
    }
    const scope = normalizeMcpScope(body.scope)
    const id = upsertMcp(mcpScopeDir(scope, deps.profileDirPath, deps.dshHome), body)
    return { ok: true, id, restartNeeded: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
