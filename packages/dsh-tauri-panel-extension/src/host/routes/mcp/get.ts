/**
 * routes/mcp/get.ts — GET /mcp：MCP 行列表（机器级 + profile 层合并）。
 *
 * 行变更都需要 dsh 重启才能组合，故列表恒带 `restartNeeded`。方法限制 / OPTIONS /
 * 连接鉴权由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../types'
import { defineEventHandler, dshRouteDepsOf } from 'dsh-tauri'
import { listMcpScoped } from '../../service/mcp'

export default defineEventHandler((event) => {
  const deps = dshRouteDepsOf<ExtensionRouteDeps>(event)!
  return { ...listMcpScoped(deps.profileDirPath), restartNeeded: true }
})
