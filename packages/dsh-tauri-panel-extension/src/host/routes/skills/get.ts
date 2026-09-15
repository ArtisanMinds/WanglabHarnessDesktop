/**
 * routes/skills/get.ts — GET /skills：技能目录（设置页卡片的数据面）。
 *
 * 请求级逻辑（置状态码、组织响应）在处理器体内；目录投影在
 * `../../service/skill-catalog.ts`。方法限制 / OPTIONS / 连接鉴权 / 回环与跨源
 * 由 `defineRoutes` 统一承担。
 */

import type { PanelExtensionHost } from '../../types'
import { defineEventHandler, dshContextOf } from 'dsh-tauri'
import { listSkillRows } from '../../service/skill-catalog'

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  try {
    return { skills: await listSkillRows(host) }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
