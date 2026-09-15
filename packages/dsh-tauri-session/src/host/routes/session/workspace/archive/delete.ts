/**
 * routes/session/workspace/archive/delete.ts — DELETE /session/workspace/archive：
 * 彻底删除项目内归档会话。
 *
 * 请求级逻辑在处理器体内；领域服务只收具体参数（sessionIds 数组）。
 */

import type { HostContext } from '../../../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { permanentlyDeleteSelected } from '../../../../service/archive'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event) as unknown as HostContext
  const body = await readBody<{ sessionIds?: unknown }>(event, { type: 'json' })
  const sessionIds = Array.isArray(body?.sessionIds)
    ? body.sessionIds.map(String).filter(Boolean)
    : []
  if (sessionIds.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-ids' }
  }
  return permanentlyDeleteSelected(ctx, sessionIds)
})
