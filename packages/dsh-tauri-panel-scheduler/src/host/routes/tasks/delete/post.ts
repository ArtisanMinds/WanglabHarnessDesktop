/**
 * routes/tasks/delete/post.ts — POST /api/dsh-scheduler/tasks/delete：删除定时任务。
 *
 * 请求级逻辑（读体、取 id、置状态码、组织响应）都在处理器体内；领域服务只收 id。
 */

import { defineEventHandler, readBody } from 'dsh-tauri'
import { deleteTask } from '../../../service/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown }>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (id.length === 0) {
    event.res.status = 400
    return { error: '缺少任务 id' }
  }
  const result = await deleteTask(id)
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true }
})
