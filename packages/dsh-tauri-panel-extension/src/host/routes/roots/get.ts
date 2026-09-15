/**
 * routes/roots/get.ts — GET /roots：已注册的自定义技能仓库列表。
 *
 * 每条附 `live` 标志（根目录可能已从磁盘消失）。方法限制 / OPTIONS / 连接鉴权由
 * `defineRoutes` 统一承担。
 */

import { defineEventHandler } from 'dsh-tauri'
import { toRootView } from '../../service/skill-catalog'
import { getSkillRoots } from '../../service/skill-root'

export default defineEventHandler(async () => {
  return { roots: (await getSkillRoots()).map(toRootView) }
})
