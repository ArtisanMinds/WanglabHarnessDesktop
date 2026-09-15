/**
 * routes/status/get.ts — GET /api/dsh-worktree/status?sessionId=&jobId=。
 *
 * 会话工作树状态的唯一读面：删除任务优先（轮询 jobId 收敛），否则读绑定账本，
 * 并按「会话未知时不猜测」的竞态语义返回 isGit: null。
 *
 * 查询串一律走 h3 的 `getQuery`；参数校验、状态码与响应形状都写在处理器体内，
 * 领域服务只收具体参数。
 */

import type { HostContext, WorktreeRouteDeps } from '../../types'
import { existsSync } from 'node:fs'
import { defineEventHandler, dshContextOf, dshRouteDepsOf, getQuery } from 'dsh-tauri'
import { gitToplevel } from '../../service/git'
import { worktreeKey } from '../../service/operation'
import { findSession, resolveProjectPath } from '../../service/session'
import { loadBinding } from '../../storage'

export default defineEventHandler(async (event) => {
  const { discardJobs } = dshRouteDepsOf<WorktreeRouteDeps>(event)!
  const ctx = dshContextOf(event) as unknown as HostContext
  const query = getQuery(event)
  const sessionId = typeof query.sessionId === 'string' ? query.sessionId : ''
  const jobId = typeof query.jobId === 'string' ? query.jobId : ''

  const job = discardJobs.lookup(sessionId, jobId)
  if (jobId && job && job.sessionId !== sessionId) {
    event.res.status = 404
    return { error: '未找到工作树删除任务' }
  }
  if (job?.state === 'deleting' || job?.state === 'failed') {
    return {
      mode: job.state,
      jobId: job.jobId,
      worktreeKey: job.worktreeKey,
      worktreePath: job.worktreePath,
      error: job.error,
    }
  }
  if (job?.state === 'completed')
    return { mode: 'local', jobId: job.jobId }

  const binding = loadBinding(sessionId)
  const activeBinding = binding && existsSync(binding.worktreePath) ? binding : null
  const session = findSession(ctx, sessionId)
  const projectPath = binding?.projectPath ?? (await resolveProjectPath(ctx, session))
  // 会话工作目录不在 git 仓库内时禁止工作树：isGit 供客户端隐藏模式选择器并强制本地模式。
  // 会话未知（新建/启动竞态，尚无 cwd）时不猜测：isGit 置 null，客户端保持默认并稍后
  // 重试，避免把 git 目录误判成非 git 而隐藏工作树模式选择器。
  // 已绑定工作树的会话必然位于 Git 仓库内（工作树由 git worktree add 创建）：直接置 true，
  // 省掉每次 status 都 fork 一个 git 子进程——status 会被客户端 hydration 反复复核。
  const isGit = activeBinding ? true : projectPath ? Boolean(await gitToplevel(projectPath)) : null
  return activeBinding
    ? {
        mode: 'worktree',
        hash: activeBinding.hash,
        dirname: activeBinding.dirname,
        worktreeKey: worktreeKey(activeBinding.hash, activeBinding.dirname),
        worktreePath: activeBinding.worktreePath,
        projectPath,
        sourceSessionId: activeBinding.sourceSessionId,
        log: Array.isArray(activeBinding.log) ? activeBinding.log : [],
        isGit,
      }
    : { mode: 'local', projectPath: projectPath ?? '', isGit }
})
