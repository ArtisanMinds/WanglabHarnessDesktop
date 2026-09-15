/**
 * routes/import/apply/post.ts — POST /import/apply：把选中的外部 MCP 行导入 profile。
 *
 * 逐条落盘并逐条回报结果（已存在 / 校验不过都不算成功），响应整体 `ok` 取各项与。
 * 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { McpInput } from '../../../service/mcp'
import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { scanAllMcp } from '../../../service/agents'
import { listMcpScoped, mcpScopeDir, normalizeMcpScope, upsertMcp, validateMcpInput } from '../../../service/mcp'

/** 导入请求体：items 为 (agent, name) 选择集。 */
interface McpImportApplyBody { items?: unknown, scope?: unknown }

export default defineEventHandler(async (event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  const body = await readBody<McpImportApplyBody>(event, { type: 'json' })
  try {
    const wanted = new Set(
      (Array.isArray(body?.items) ? body.items : [])
        .filter((item): item is { agent: string, name: string } =>
          typeof item === 'object' && item !== null && typeof (item as { agent?: unknown }).agent === 'string' && typeof (item as { name?: unknown }).name === 'string')
        .map(item => `${item.agent}/${item.name}`),
    )
    const dir = mcpScopeDir(normalizeMcpScope(body?.scope), deps.profileDirPath)
    const results: Array<{ name: string, ok: boolean, error?: string }> = []
    for (const server of scanAllMcp()) {
      if (!wanted.has(`${server.agent}/${server.name}`))
        continue
      const existing = listMcpScoped(deps.profileDirPath).servers.some(row => row.serverName === server.name)
      if (existing) {
        results.push({ name: server.name, ok: false, error: 'already in profile' })
        continue
      }
      const input: McpInput = {
        id: '',
        serverName: server.name,
        transport: server.transport,
        ...(server.transport === 'stdio'
          ? { command: server.command, args: server.args, env: server.env }
          : { url: server.url, headers: server.headers }),
      }
      const invalid = validateMcpInput(input)
      if (invalid !== null) {
        results.push({ name: server.name, ok: false, error: invalid })
        continue
      }
      upsertMcp(dir, input)
      results.push({ name: server.name, ok: true })
    }
    return { ok: results.every(item => item.ok), results, restartNeeded: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
