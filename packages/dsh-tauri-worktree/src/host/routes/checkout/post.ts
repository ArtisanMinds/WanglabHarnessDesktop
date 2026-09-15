/**
 * routes/checkout/post.ts — POST /api/dsh-worktree/checkout。
 *
 * UI 检出：git 检出 + 把工作树会话完整历史带回本地新会话（targetSessionId）。
 * `carryStaged` 可选：把工作树已暂存内容携带回本地检出。
 */

import type { HostContext, WorktreeRouteDeps } from '../../types'
import { defineEventHandler, dshContextOf, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { checkoutToLocalAndHandback } from '../../service/handoff'

/** 检出请求体（形状校验在处理器内做，绝不信客户端类型）。 */
interface CheckoutBody {
  sessionId?: unknown
  worktreeHashDirname?: unknown
  branchName?: unknown
  carryStaged?: unknown
}

export default defineEventHandler(async (event) => {
  const { config } = dshRouteDepsOf<WorktreeRouteDeps>(event)!
  const host = dshContextOf(event) as unknown as HostContext
  const body = (await readBody<CheckoutBody>(event)) ?? {}
  const r = await checkoutToLocalAndHandback(host, {
    sessionId: String(body.sessionId ?? ''),
    worktree_hash_dirname: String(body.worktreeHashDirname ?? ''),
    branch_name: String(body.branchName ?? ''),
  }, {
    carryStaged: body.carryStaged === true,
    linkDependencyDirectories: config.linkDependencyDirectories,
  })
  if (!r.ok) {
    event.res.status = 400
    return { error: r.error }
  }
  return {
    ok: true,
    branch: r.branch,
    projectPath: r.projectPath,
    targetSessionId: r.targetSessionId,
  }
})
