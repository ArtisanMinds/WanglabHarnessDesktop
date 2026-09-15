/**
 * routes/open-url/post.ts — POST /api/dsh-rightclick-menu/open-url：
 * 用系统默认浏览器打开 http/https 外链（原生文件系统打开能力不接受 URL，URL 必须走这里）。
 *
 * 请求级逻辑（读体、校验、置状态码、组织响应）全部写在处理器体内；方法限制
 * （405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更方法的回环与跨源校验、
 * 1 MiB 请求体上限由 `defineRoutes` 统一承担，这里不再重复实现。
 *
 * 与迁移前一致，只接受 `application/json` 请求体（其余 415 `unsupported-media-type`）：
 * 这条内容类型约束不在 `defineRoutes` 的内建边界里（它只做方法/连接/回环/跨源/体积），
 * 而 `readBody(event, { type: 'json' })` 会**忽略**请求的 Content-Type 直接按 JSON 解析——
 * 少了这道闸，迁移前被 415 拒掉的请求（如 text/plain 携带合法 JSON）会变成 200 并被真正执行。
 */

import type { HostContext } from '../../../types'
import { defineEventHandler, dshContextOf, openUrl, readBody, safeWebUrl } from 'dsh-tauri'
import { RIGHTCLICK_PLUGIN_NAME } from '../../../constants'
import { withMutationLock } from '../../service/mutation-queue'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext

  const contentType = event.req.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    event.res.status = 415
    return { ok: false as const, error: 'unsupported-media-type' }
  }

  const body = await readBody<{ url?: unknown }>(event, { type: 'json' })
  const url = safeWebUrl(body?.url)
  if (!url) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-url' }
  }

  // 串行化宿主变更：开链与开目录共用一条队列，不并发拉起 OS 进程。
  return withMutationLock(async () => {
    try {
      await openUrl(url)
      return { ok: true as const }
    }
    catch (error) {
      ctx.logger?.warn?.(`[${RIGHTCLICK_PLUGIN_NAME}] failed to open URL ${url}:`, error)
      event.res.status = 500
      return { ok: false as const, error: 'open-url-failed' }
    }
  })
})
