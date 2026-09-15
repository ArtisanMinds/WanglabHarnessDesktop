/**
 * routes/session/live/get.ts — GET /api/turnrewind/session/live：运行中实时读数（客户端提示条轮询）。
 *
 * 目录层级即 URL 层级：`session` 资源下的 `live` 子资源。
 * 宿主侧读数由 capture 编排器定时刷新到内存，本路由只读缓存值：
 * 客户端轮询频率因此与 git 调用频率解耦（大仓库不会因为轮询而反复跑 git）。
 * 未接线 live 读取面时返回 inactive 占位（与旧实现逐字一致）。
 */

import type { LiveSnapshot, TurnrewindRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, getQuery } from 'dsh-tauri'

export default defineEventHandler((event): LiveSnapshot | { error: string } => {
  const query = getQuery(event) as { sessionId?: unknown }
  const sessionId = typeof query.sessionId === 'string' ? query.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { error: '缺少 sessionId' }
  }
  return dshRouteDepsOf<TurnrewindRouteDeps>(event)!.live?.(sessionId)
    ?? { active: false, turn: null, fileCount: 0, insertions: 0, deletions: 0 }
})
