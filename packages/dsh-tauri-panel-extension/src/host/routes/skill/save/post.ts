/**
 * routes/skill/save/post.ts — POST /skill/save：保存（新建或就地编辑）一个技能。
 *
 * 请求级逻辑（读体、归一化字段、校验、置状态码）都在处理器体内；写入原语在
 * `../../service/skills.ts`，可写性判定在 `../../service/skill-catalog.ts`。
 * 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { SkillInput } from '../../../service/skills'
import type { PanelExtensionHost } from '../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { join } from 'pathe'
import { skillWritable } from '../../../service/skill-catalog'
import { updateSkillFile, validateSkillInput, writeSkill } from '../../../service/skills'

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  const body = await readBody<Partial<SkillInput>>(event, { type: 'json' })
  const input: SkillInput = {
    name: typeof body?.name === 'string' ? body.name : '',
    description: typeof body?.description === 'string' ? body.description : '',
    whenToUse: typeof body?.whenToUse === 'string' ? body.whenToUse : undefined,
    modelInvocable: body?.modelInvocable !== false,
    userInvocable: body?.userInvocable !== false,
    content: typeof body?.content === 'string' ? body.content : '',
  }
  try {
    const invalid = validateSkillInput(input)
    if (invalid !== null) {
      event.res.status = 400
      return { error: invalid }
    }
    // An existing skill edits in place (its own folder, whichever editable source
    // it comes from — preserving frontmatter keys the editor does not own); a new
    // name creates in the user root. The file location is resolved server-side
    // from the catalog, never taken from the request.
    const existing = (await host.skills.list()).find(skill => skill.name === input.name)
    if (existing !== undefined) {
      const dir = existing.resourceBase?.kind === 'directory' ? existing.resourceBase.path : undefined
      if (dir === undefined || !await skillWritable(existing, dir)) {
        event.res.status = 403
        return { error: `skills from source '${existing.source}' are read-only` }
      }
      updateSkillFile(join(dir, 'SKILL.md'), input)
    }
    else {
      writeSkill(input)
    }
    return { ok: true, name: input.name }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
