/**
 * routes/mcp/toggle/post.ts — POST /mcp/toggle：启用 / 停用一行 MCP 服务器。
 *
 * 行不存在返回 404（不是静默成功）；成功恒带 `restartNeeded`。方法限制 / 连接鉴权 /
 * 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { mcpScopeDir, normalizeMcpScope, setMcpDisabled } from '../../../service/mcp'

/** 启停请求体：id + disabled 都必须成立。 */
interface McpToggleBody { id?: unknown, disabled?: unknown, scope?: unknown }

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpToggleBody>(event, { type: 'json' })
  if (typeof body?.id !== 'string' || typeof body.disabled !== 'boolean') {
    event.res.status = 400
    return { error: 'id and disabled are required' }
  }
  const id = body.id
  const disabled = body.disabled
  try {
    const ok = setMcpDisabled(mcpScopeDir(normalizeMcpScope(body.scope), deps.profileDirPath), id, disabled)
    if (!ok) {
      event.res.status = 404
      return { error: 'server row not found' }
    }
    return { ok: true, restartNeeded: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
