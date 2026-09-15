/**
 * routes/import/scan/get.ts — GET /import/scan：扫描外部 agent 的 MCP 配置。
 *
 * 返回可导入项，以及 profile 层已存在的 serverName（浏览器据此置灰）。
 * 方法限制 / OPTIONS / 连接鉴权由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf } from 'dsh-tauri'
import { scanAllMcp } from '../../../service/agents'
import { listMcpScoped } from '../../../service/mcp'

export default defineEventHandler((event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  try {
    return {
      servers: scanAllMcp(),
      // Profile serverNames, so the browser can grey out existing ones.
      existing: listMcpScoped(deps.profileDirPath, deps.dshHome).servers.map(row => row.serverName),
    }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
