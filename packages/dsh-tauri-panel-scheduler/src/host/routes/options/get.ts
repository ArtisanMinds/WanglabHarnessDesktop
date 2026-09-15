/**
 * routes/options/get.ts — GET /api/dsh-scheduler/options：对话框下拉选项（工作区 / 权限 / 模型）。
 *
 * 宿主 ctx 从事件取回（`defineRoutes` 在调用处理器前挂好 `event.context.dsh`），
 * 因此不需要 apply 期依赖注入。响应体是选项对象本身，不额外包一层。
 */

import { defineEventHandler, dshContextOf } from 'dsh-tauri'
import { collectSchedulerOptions } from '../../service/options'

export default defineEventHandler(async (event) => {
  const ctx = dshContextOf(event)
  if (ctx === undefined) {
    event.res.status = 500
    return { error: 'missing-host-context' }
  }
  return collectSchedulerOptions(ctx)
})
