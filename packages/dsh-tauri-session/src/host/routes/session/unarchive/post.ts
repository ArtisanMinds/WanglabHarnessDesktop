/**
 * routes/session/unarchive/post.ts — POST /session/unarchive：从宿主归档集合移除
 * （走注册表内部状态机，见 host/service/registry.ts）。
 *
 * 请求级逻辑在处理器体内；领域服务只收具体参数（sessionId）。
 */

import type { HostContext } from '../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { unarchiveSession } from '../../../service/archive'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext
  const body = await readBody<{ sessionId?: unknown }>(event, { type: 'json' })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-id' }
  }
  return unarchiveSession(ctx, sessionId)
})
