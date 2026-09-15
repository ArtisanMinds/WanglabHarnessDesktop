/**
 * routes/session/archive/clear/post.ts — POST / DELETE /session/archive/clear：
 * 彻底删除全部已归档会话。
 *
 * 同一处理器登记到两个方法（`disposer.post(...)` + `disposer.delete(...)`）。
 * 无请求体（id 集合由宿主归档集合决定），处理器体内直接取回 ctx 并调用领域服务。
 */

import type { HostContext } from '../../../../types'
import { defineEventHandler, dshContextOf } from 'dsh-tauri'
import { permanentlyDeleteAll } from '../../../../service/archive'

export default defineEventHandler((event) => {
  const ctx = dshContextOf(event) as unknown as HostContext
  return permanentlyDeleteAll(ctx)
})
