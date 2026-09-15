/**
 * routes/tasks/create/post.ts — POST /api/dsh-scheduler/tasks/create：新建定时任务。
 *
 * 请求级逻辑（读体、置状态码、组织响应）都在处理器体内；形状校验由领域服务
 * `createTask` 的 `validateTaskInput` 承担（它接受 unknown 并返回错误串），
 * 因此这里只把请求体原样交给服务，不重复实现校验。
 */

import type { TaskInput } from '../../../service/task'
import { defineEventHandler, readBody } from 'dsh-tauri'
import { createTask } from '../../../service/task'

export default defineEventHandler(async (event) => {
  const body = await readBody<TaskInput>(event)
  if (body === undefined) {
    event.res.status = 400
    return { error: '请求体必须是对象' }
  }
  const result = await createTask(body)
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true, task: result.task }
})
