import type { SchedulerRouteDeps } from '../../../types'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown }>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (id.length === 0) {
    event.res.status = 400
    return { error: '缺少任务 id' }
  }
  const result = await dshRouteDepsOf<SchedulerRouteDeps>(event)!.engine.runNow(id)
  if (!result.ok) {
    event.res.status = 400
    return { error: result.error }
  }
  return { ok: true }
})
