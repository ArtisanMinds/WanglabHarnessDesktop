/**
 * routes/mcp/copy/post.ts — POST /mcp/copy：把一行复制到另一个 patch 层。
 *
 * 复制体的 id 重新分配（`upsertMcp` 会去重）；响应回报实际落点 scope。
 * 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { listMcp, mcpRowToInput, mcpScopeDir, normalizeMcpScope, upsertMcp } from '../../../service/mcp'

/** 复制请求体：id 必填，toScope 缺省即 profile 层。 */
interface McpCopyBody { id?: unknown, scope?: unknown, toScope?: unknown }

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpCopyBody>(event, { type: 'json' })
  if (typeof body?.id !== 'string') {
    event.res.status = 400
    return { error: 'id is required' }
  }
  const id = body.id
  try {
    const sourceDir = mcpScopeDir(normalizeMcpScope(body.scope), deps.profileDirPath, deps.dshHome)
    const source = listMcp(sourceDir).find(item => item.id === id)
    if (source === undefined) {
      event.res.status = 404
      return { error: 'server row not found' }
    }
    const scope = normalizeMcpScope(body.toScope)
    const createdId = upsertMcp(
      mcpScopeDir(scope, deps.profileDirPath, deps.dshHome),
      mcpRowToInput(source),
    )
    return { ok: true, id: createdId, scope, restartNeeded: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
