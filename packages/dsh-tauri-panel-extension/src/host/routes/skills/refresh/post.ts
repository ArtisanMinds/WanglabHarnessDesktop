/**
 * routes/skills/refresh/post.ts — POST /skills/refresh：显式重扫技能目录。
 *
 * 重挂宿主 provider 会重跑全部根的发现（打包技能、注册仓库、`~/.claude|.codex`，
 * 以及 provider 自带的默认根），并使注册表的 collect 缓存失效，因此随后的列表能
 * 反映新增技能而无需重启。方法限制 / 连接鉴权 / 回环与跨源由 `defineRoutes` 承担。
 */

import type { ExtensionRouteDeps, PanelExtensionHost } from '../../../types'
import { defineEventHandler, dshContextOf, dshRouteDepsOf } from 'dsh-tauri'
import { listSkillRows } from '../../../service/skill-catalog'

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  try {
    await dshRouteDepsOf<ExtensionRouteDeps>(event)!.remountProvider()
    return { skills: await listSkillRows(host) }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
