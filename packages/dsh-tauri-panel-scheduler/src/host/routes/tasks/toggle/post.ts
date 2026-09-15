/**
 * routes/tasks/toggle/post.ts — POST /api/dsh-scheduler/tasks/toggle：暂停 / 启用任务。
 *
 * 请求级逻辑（读体、取 id/enabled、置状态码、组织响应）都在处理器体内；
 * 领域服务只收具体参数（id + enabled 布尔）。
 */

import { defineEventHandler, readBody } from 'dsh-tauri'
import { setTaskEnabled } from '../../../service/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown, enabled?: unknown }>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (id.length === 0) {
    event.res.status = 400
    return { error: '缺少任务 id' }
  }
  const result = await setTaskEnabled(id, body?.enabled === true)
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true, task: result.task }
})
