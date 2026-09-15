/**
 * routes/delete.ts — DELETE /api/dsh-worktree（worktree 集合资源上删除，文件路径 = URL 路径：
 * `routes/` 即集合根 `${WORKTREE_API_PREFIX}`）。
 *
 * 放弃工作树：登记一个后台删除任务并立刻返回 jobId（客户端轮询 /status 收敛）。
 * 幂等：同一 (会话, worktree key) 的在飞任务与已完成任务都直接复用；
 * 无绑定且确定性路径已消失的会话视为「早已清理干净」，返回成功而不造幻影任务。
 *
 * DELETE 属变更方法，非回环 / 跨源 403 由 `defineRoutes` 统一承担；请求体仍按 JSON 解析。
 */

import type { WorktreeRouteDeps } from '../types'
import { existsSync } from 'node:fs'
import { defineEventHandler, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { worktreePath } from '../service/operation'
import { loadBinding } from '../storage'

/** 放弃（删除）请求体（形状校验在处理器内做，绝不信客户端类型）。 */
interface DiscardBody {
  sessionId?: unknown
  worktreeHashDirname?: unknown
}

export default defineEventHandler(async (event) => {
  const { discardJobs } = dshRouteDepsOf<WorktreeRouteDeps>(event)!
  const body = (await readBody<DiscardBody>(event, { type: 'json' })) ?? {}
  const sessionId = String(body.sessionId ?? '')
  const worktreeHashDirname = String(body.worktreeHashDirname ?? '')

  const reused = discardJobs.reuse(sessionId, worktreeHashDirname)
  if (reused)
    return { ok: true, jobId: reused.jobId }

  const binding = loadBinding(sessionId)
  // Idempotent re-discard: a binding-less session whose deterministic
  // worktree path is already gone was fully cleaned earlier (possibly in
  // a previous plugin lifetime). Report success instead of a phantom job.
  const [hash, dirname] = worktreeHashDirname.split('/')
  if (!binding && hash && dirname && !existsSync(worktreePath(hash, dirname)))
    return { ok: true }

  const job = discardJobs.start(sessionId, worktreeHashDirname, binding?.worktreePath)
  return { ok: true, jobId: job.jobId }
})
