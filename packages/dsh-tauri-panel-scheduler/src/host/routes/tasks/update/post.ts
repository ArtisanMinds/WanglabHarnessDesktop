/**
 * routes/tasks/update/post.ts — POST /api/dsh-scheduler/tasks/update：更新定时任务。
 *
 * 请求级逻辑（读体、取 id、置状态码、组织响应）都在处理器体内；领域服务只收
 * 具体参数（id + 补丁）。补丁形状校验由 `updateTask` 内部合并语义承担。
 */

import type { TaskInput } from '../../../service/task'
import { defineEventHandler, readBody } from 'dsh-tauri'
import { updateTask } from '../../../service/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown } & Partial<TaskInput>>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (id.length === 0) {
    event.res.status = 400
    return { error: '缺少任务 id' }
  }
  const result = await updateTask(id, body ?? {})
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true, task: result.task }
})
