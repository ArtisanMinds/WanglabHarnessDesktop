/**
 * routes/session/undo/post.ts — POST /api/turnrewind/session/undo 处理器（唯一的写路由）。
 *
 * 目录层级即 URL 层级：`session` 资源下的 `undo` 子资源。
 * 写边界（方法限制、连接信任、非回环 403、跨源 403）由 `defineRoutes` 统一承担；
 * 这里只做参数校验、会话归属校验与撤销执行。响应形状与迁移前逐字一致：
 * 成功 `{ ok: true, restored, removed, failed }`，失败 `{ error, conflicts }` + 业务状态码。
 */

import type { TurnrewindRouteDeps, UndoResponse } from '../../../types'
import { defineEventHandler, dshContextOf, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { undoTurn } from '../../../service/undo'
import { findSession, probeWorkspace, sessionCwdOf } from '../../../service/workspace'

/** 撤销请求体（形状校验在处理器内做，绝不信客户端类型）。 */
interface UndoBody {
  sessionId?: unknown
  turn?: unknown
}

export default defineEventHandler(async (event): Promise<UndoResponse> => {
  const deps = dshRouteDepsOf<TurnrewindRouteDeps>(event)!
  const ctx = dshContextOf(event)
  const body = (await readBody<UndoBody>(event)) ?? {}
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const turn = Number(body.turn)
  if (sessionId.length === 0) {
    event.res.status = 400
    return { error: '缺少 sessionId' }
  }
  if (!Number.isInteger(turn) || turn <= 0) {
    event.res.status = 400
    return { error: 'turn 必须是正整数' }
  }
  const session = findSession(ctx, sessionId)
  if (session === undefined) {
    event.res.status = 404
    return { error: '会话不存在或尚未就绪' }
  }
  const probe = await probeWorkspace(sessionCwdOf(session))
  // 归属校验用当前 worktree 根；探测失败时传 null，由 service 层按账本判定。
  // 撤销与捕获共用同一队列，且该会话仍在跑时直接拒绝（after 快照尚未结算）。
  const { isTurnPending, live, queue } = deps
  const outcome = await undoTurn({
    sessionId,
    turn,
    currentWorkspace: probe.ok ? probe.root : null,
    queue,
    turnActive: isTurnPending === undefined ? live?.(sessionId).active === true : isTurnPending(sessionId, turn),
  })
  if (outcome.ok) {
    return { ok: true, restored: outcome.restored, removed: outcome.removed, failed: outcome.failed }
  }
  event.res.status = outcome.code
  return { error: outcome.error, conflicts: outcome.conflicts ?? [] }
})
