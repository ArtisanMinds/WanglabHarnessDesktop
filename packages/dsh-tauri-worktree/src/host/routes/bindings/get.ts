/**
 * routes/bindings/get.ts — GET /api/dsh-worktree/bindings。
 *
 * 批量绑定视图：客户端 hydration 用一次请求就知道「列表里哪些会话在工作树里」，
 * 不必为列表里每个会话各打一次 /status（实测某 profile 有 400 个会话 → 400 次请求）。
 * 只返回仍存在于磁盘的绑定（worktree 已被检出的会话按本地处理），以及未收敛的删除任务。
 *
 * 方法限制、连接信任边界与请求体上限由 `defineRoutes` 统一承担；本处理器只组织响应。
 */

import type { WorktreeRouteDeps } from '../../types'
import { existsSync } from 'node:fs'
import { defineEventHandler, dshRouteDepsOf } from 'dsh-tauri'
import { worktreeKey } from '../../service/operation'
import { listBindings } from '../../storage'

export default defineEventHandler(async (event) => {
  const { discardJobs } = dshRouteDepsOf<WorktreeRouteDeps>(event)!
  const bindings = listBindings()
  return {
    bindings: bindings
      .filter(binding => binding.worktreePath && existsSync(binding.worktreePath))
      .map(binding => ({
        sessionId: binding.sessionId,
        sourceSessionId: binding.sourceSessionId ?? '',
        hash: binding.hash,
        dirname: binding.dirname,
        worktreeKey: worktreeKey(binding.hash, binding.dirname),
        worktreePath: binding.worktreePath,
        projectPath: binding.projectPath,
        log: Array.isArray(binding.log) ? binding.log : [],
      })),
    jobs: discardJobs.unsettled().map(job => ({
      sessionId: job.sessionId,
      jobId: job.jobId,
      state: job.state,
      error: job.error,
      worktreeKey: job.worktreeKey,
      worktreePath: job.worktreePath,
    })),
  }
})
