/**
 * routes/recover/post.ts — POST /api/dsh-scheduler/recover：启动自愈（中断的 running → interrupted）。
 *
 * 无请求参数；响应固定 `{ ok: true }`（客户端 `hydrateScheduler` 只关心成败）。
 */

import { defineEventHandler } from 'dsh-tauri'
import { recoverInterruptedRuns } from '../../service/run'

export default defineEventHandler(async () => {
  await recoverInterruptedRuns()
  return { ok: true }
})
