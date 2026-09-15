/**
 * routes/session/archive/post.ts — POST /session/archive：归档单个会话。
 *
 * 请求级逻辑（读体、校验、置状态码、组织响应）都在处理器体内；领域服务只收
 * 具体参数（sessionId）。方法限制 / OPTIONS / 连接鉴权 / 回环与跨源校验 /
 * 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { HostContext } from '../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { archiveSession } from '../../../service/archive'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext
  const body = await readBody<{ sessionId?: unknown }>(event, { type: 'json' })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-id' }
  }
  return archiveSession(ctx, sessionId)
})
