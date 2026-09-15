/**
 * routes/roots/remove/post.ts — POST /roots/remove：注销一个自定义技能仓库。
 *
 * Unwatch before unlink: the provider's directory watchers hold handles on the
 * material tree, and removing a watched tree on Windows fails with EPERM (the
 * state is already saved by then, which is why the repo still disappears
 * despite the error). 方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限由
 * `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { removeTree } from '../../../service/rmtree'
import { deleteSkillRoot } from '../../../service/skill-root'

/** 注销请求体：只有 id 参与。 */
interface RootRemoveBody { id?: unknown }

export default defineEventHandler(async (event) => {
  const body = await readBody<RootRemoveBody>(event, { type: 'json' })
  if (typeof body?.id !== 'string') {
    event.res.status = 400
    return { error: 'id is required' }
  }
  const id = body.id
  try {
    const removed = await deleteSkillRoot(id)
    if (removed === undefined) {
      event.res.status = 404
      return { error: 'repository not found' }
    }
    await dshRouteDepsOf<ExtensionRouteDeps>(event)!.remountProvider()
    if (removed.materialDir !== undefined)
      removeTree(removed.materialDir)
    return { ok: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
