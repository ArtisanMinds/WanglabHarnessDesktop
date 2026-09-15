/**
 * routes/session/archive/get.ts — GET /session/archive：读宿主归档集合 + 每个会话的
 * 创建元数据（host session header）。
 *
 * 处理器体内直接取回宿主 ctx 并返回归档投影（`buildArchivedPayload` 是 GET 与
 * archive/unarchive 变更路由共享的领域投影，保留在 service 里）。
 */

import { defineEventHandler, dshContextOf } from 'dsh-tauri'
import { buildArchivedPayload } from '../../../service/archive'

export default defineEventHandler((event) => {
  const ctx = dshContextOf(event)
  return buildArchivedPayload(ctx)
})
