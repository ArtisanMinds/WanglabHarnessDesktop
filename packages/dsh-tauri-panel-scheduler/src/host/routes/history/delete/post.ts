/**
 * routes/history/delete/post.ts — POST /api/dsh-scheduler/history/delete：删除执行记录。
 *
 * 请求级逻辑（读体、取 id、置状态码、组织响应）都在处理器体内；领域服务只收 id。
 */

import { defineEventHandler, readBody } from 'dsh-tauri'
import { deleteRun } from '../../../service/run'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown }>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (id.length === 0) {
    event.res.status = 400
    return { error: '缺少执行记录 id' }
  }
  const result = await deleteRun(id)
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true }
})
