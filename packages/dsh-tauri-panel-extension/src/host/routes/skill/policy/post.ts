/**
 * routes/skill/policy/post.ts — POST /skill/policy：切换一个技能的加载策略。
 *
 * 只改技能文件 frontmatter 里的两个 invocation 键（见 service/skills.ts 的
 * setSkillPolicy）。运行时注册（无磁盘文件）的技能返回 422，而不是静默成功。
 * 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { PanelExtensionHost } from '../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { setSkillPolicy } from '../../../service/skills'

/** 策略请求体：name + enabled 都必须成立。 */
interface SkillPolicyBody { name?: unknown, enabled?: unknown }

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  const body = await readBody<SkillPolicyBody>(event, { type: 'json' })
  if (typeof body?.name !== 'string' || typeof body?.enabled !== 'boolean') {
    event.res.status = 400
    return { error: 'name and enabled are required' }
  }
  const name = body.name
  const enabled = body.enabled
  try {
    const definition = await host.skills.get(name)
    if (definition === undefined) {
      event.res.status = 404
      return { error: 'skill not found' }
    }
    if (definition.path === undefined) {
      event.res.status = 422
      return { error: 'skill has no file on disk (runtime-registered)' }
    }
    setSkillPolicy(definition.path, enabled)
    return { ok: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
