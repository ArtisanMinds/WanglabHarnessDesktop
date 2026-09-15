/**
 * routes/skill/get.ts — GET /skill?name=<name>：单个技能的内容。
 *
 * 查询串一律用 h3 内置的 `getQuery`；名称缺失或非法时按空名查询，命中不到即 404。
 * 方法限制 / OPTIONS / 连接鉴权由 `defineRoutes` 统一承担。
 */

import type { PanelExtensionHost } from '../../types'
import { defineEventHandler, dshContextOf, getQuery } from 'dsh-tauri'

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  const query = getQuery(event) as { name?: unknown }
  const name = typeof query.name === 'string' ? query.name : ''
  try {
    const definition = await host.skills.get(name)
    if (definition === undefined) {
      event.res.status = 404
      return { error: 'skill not found' }
    }
    return { name: definition.name, content: definition.content }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
