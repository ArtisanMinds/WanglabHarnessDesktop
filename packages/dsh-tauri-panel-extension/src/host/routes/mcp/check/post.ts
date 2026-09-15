/**
 * routes/mcp/check/post.ts — POST /mcp/check：一行 MCP 服务器的连通性检查。
 *
 * 不启动进程：stdio 行按 PATH 校验命令（spawn 会留下控制台窗口与副作用），
 * streamable-http 行走一次短 GET。方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限
 * 由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { checkMcpRow, listMcp, mcpScopeDir, normalizeMcpScope } from '../../../service/mcp'

/** 检查请求体：只有 id 参与。 */
interface McpCheckBody { id?: unknown, scope?: unknown }

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpCheckBody>(event, { type: 'json' })
  if (typeof body?.id !== 'string') {
    event.res.status = 400
    return { error: 'id is required' }
  }
  const id = body.id
  try {
    const dir = mcpScopeDir(normalizeMcpScope(body.scope), deps.profileDirPath)
    const row = listMcp(dir).find(item => item.id === id)
    if (row === undefined) {
      event.res.status = 404
      return { error: 'server row not found' }
    }
    return await checkMcpRow(row)
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
