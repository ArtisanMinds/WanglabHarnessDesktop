/**
 * routes/mcp/remove/post.ts — POST /mcp/remove：移除一行 MCP 服务器。
 *
 * 行不存在返回 404；成功恒带 `restartNeeded`。方法限制 / 连接鉴权 / 回环与跨源 /
 * 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { mcpScopeDir, normalizeMcpScope, removeMcp } from '../../../service/mcp'

/** 移除请求体：只有 id 参与。 */
interface McpRemoveBody { id?: unknown, scope?: unknown }

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpRemoveBody>(event, { type: 'json' })
  if (typeof body?.id !== 'string') {
    event.res.status = 400
    return { error: 'id is required' }
  }
  const id = body.id
  try {
    const ok = removeMcp(mcpScopeDir(normalizeMcpScope(body.scope), deps.profileDirPath), id)
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
