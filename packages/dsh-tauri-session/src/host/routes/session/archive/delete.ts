/**
 * routes/session/archive/delete.ts — DELETE /session/archive：彻底删除单个归档会话
 * （归档集合移除 + 物理删除会话数据）。
 *
 * 请求级逻辑在处理器体内；领域服务只收具体参数（sessionId）。DELETE 是变更方法，
 * 回环 / 跨源校验由 `defineRoutes` 承担；请求体仍按 JSON 解析。
 */

import type { HostContext } from '../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { permanentlyDeleteSession } from '../../../service/archive'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext
  const body = await readBody<{ sessionId?: unknown }>(event, { type: 'json' })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-id' }
  }
  return permanentlyDeleteSession(ctx, sessionId)
})
