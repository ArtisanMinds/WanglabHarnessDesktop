/**
 * routes/roots/add/post.ts — POST /roots/add：注册一个自定义技能仓库。
 *
 * local 走原地扫描（单技能目录会包一层 junction 包装目录），git 走 tarball 下载。
 * 注册后必须先重挂宿主 provider（其目录 watcher 持有新根的句柄），注册失败一律
 * 400 并把领域错误原文回给浏览器。方法限制 / 连接鉴权 / 回环与跨源 / 1 MiB 上限
 * 由 `defineRoutes` 统一承担。
 */

import type { ExtensionRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { addGitRepo, addLocalRepo } from '../../../service/repos'
import { toRootView } from '../../../service/skill-catalog'

/** 注册请求体：kind 决定用 path 还是 url。 */
interface RootAddBody { kind?: unknown, path?: unknown, url?: unknown }

export default defineEventHandler(async (event) => {
  const body = await readBody<RootAddBody>(event, { type: 'json' })
  if (body?.kind !== 'local' && body?.kind !== 'git') {
    event.res.status = 400
    return { error: 'kind must be local or git' }
  }
  const kind = body.kind
  try {
    const entry = kind === 'local'
      ? typeof body.path === 'string' && body.path.trim() !== ''
        ? await addLocalRepo(body.path)
        : undefined
      : typeof body.url === 'string' && body.url.trim() !== ''
        ? await addGitRepo(body.url)
        : undefined
    if (entry === undefined) {
      event.res.status = 400
      return { error: kind === 'local' ? 'path is required' : 'url is required' }
    }
    await dshRouteDepsOf<ExtensionRouteDeps>(event)!.remountProvider()
    return { ok: true, root: toRootView(entry) }
  }
  catch (error) {
    event.res.status = 400
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
