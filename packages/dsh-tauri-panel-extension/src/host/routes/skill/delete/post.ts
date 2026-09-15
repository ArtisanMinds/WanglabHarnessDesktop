/**
 * routes/skill/delete/post.ts — POST /skill/delete：删除用户根下的一个技能。
 *
 * 名称语法由 `deleteSkill` 内的 SKILL_NAME_RE 把关（不合法即未命中 → 404）。
 * 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import { defineEventHandler, readBody } from 'dsh-tauri'
import { deleteSkill } from '../../../service/skills'

/** 删除请求体：只有 name 参与。 */
interface SkillDeleteBody { name?: unknown }

export default defineEventHandler(async (event) => {
  const body = await readBody<SkillDeleteBody>(event, { type: 'json' })
  const name = typeof body?.name === 'string' ? body.name : ''
  try {
    if (!deleteSkill(name)) {
      event.res.status = 404
      return { error: 'skill not found' }
    }
    return { ok: true, name }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
