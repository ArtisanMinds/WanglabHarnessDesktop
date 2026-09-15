/**
 * routes/open-path/post.ts — POST /api/dsh-rightclick-menu/open-path：
 * 在系统文件管理器中打开本地目录（不依赖核心 Remote 服务，新旧核心均可用）。
 *
 * 请求级逻辑（读体、校验、置状态码、组织响应）全部写在处理器体内；方法限制
 * （405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更方法的回环与跨源校验、
 * 1 MiB 请求体上限由 `defineRoutes` 统一承担，这里不再重复实现。
 *
 * 参数必须是本地路径：带 URL scheme 的值一律 400 `invalid-path`（外链由 open-url 走默认浏览器）。
 * 与迁移前一致，只接受 `application/json` 请求体（其余 415 `unsupported-media-type`）。
 *
 * `openDirectory` 在路径不存在或不是目录时抛错（核心契约：调用方据此回 400），
 * 这里映射为既有的 400 `{ ok: false, error: 'not-a-directory' }`。
 */

import type { HostContext } from '../../../types'
import { defineEventHandler, dshContextOf, openDirectory, readBody } from 'dsh-tauri'
import { RIGHTCLICK_PLUGIN_NAME } from '../../../constants'
import { withMutationLock } from '../../service/mutation-queue'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext

  const contentType = event.req.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    event.res.status = 415
    return { ok: false as const, error: 'unsupported-media-type' }
  }

  const body = await readBody<{ path?: unknown }>(event, { type: 'json' })
  const path = typeof body?.path === 'string' ? body.path : ''
  if (path.trim().length === 0 || /^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-path' }
  }

  // 串行化宿主变更：开链与开目录共用一条队列，不并发拉起 OS 进程。
  return withMutationLock(async () => {
    try {
      await openDirectory(path)
      return { ok: true as const }
    }
    catch (error) {
      ctx.logger?.warn?.(`[${RIGHTCLICK_PLUGIN_NAME}] failed to open directory ${path}:`, error)
      event.res.status = 400
      return { ok: false as const, error: 'not-a-directory' }
    }
  })
})
