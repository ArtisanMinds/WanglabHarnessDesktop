/**
 * routes/session/summary/get.ts — GET /api/turnrewind/session/summary：某会话的 turn 变更摘要
 * （客户端卡片的数据面）。
 *
 * 目录层级即 URL 层级：`session` 资源下的 `summary` 子资源。
 * 以**当前**资格为准（cwd 可能在会话中途切换）：账本里的旧结论只作为兜底。
 * 200 时返回 SummaryPayload；参数/会话不成立时返回 `{ error }` 文案。
 * 安全边界（方法限制 / 连接信任 / 回环 / 跨源）由 `defineRoutes` 统一承担。
 */

import type { SummaryPayload, TurnrewindRouteDeps } from '../../../types'
import { defineEventHandler, dshContextOf, dshRouteDepsOf, getQuery } from 'dsh-tauri'
import { MAX_SUMMARY_FILES, REASON_GIT_REQUIRED } from '../../../constants'
import { readLedger } from '../../../service/ledger'
import { findSession, probeWorkspace, sessionCwdOf } from '../../../service/workspace'

/** 每条 turn 记录最多回传多少个「不在撤销范围内」的路径（避免载荷无界）。 */
const MAX_SKIPPED_PATHS = 20

export default defineEventHandler(async (event): Promise<SummaryPayload | { error: string }> => {
  const deps = dshRouteDepsOf<TurnrewindRouteDeps>(event)!
  const ctx = dshContextOf(event)
  const query = getQuery(event) as { sessionId?: unknown }
  const sessionId = typeof query.sessionId === 'string' ? query.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { error: '缺少 sessionId' }
  }
  const session = findSession(ctx, sessionId)
  if (session === undefined) {
    event.res.status = 404
    return { error: '会话不存在或尚未就绪' }
  }
  const ledger = await readLedger(deps.dshHome, sessionId)
  const probe = await probeWorkspace(sessionCwdOf(session))
  // 非 Git → false（客户端点撤销弹「需要 Git 仓库」）；「确实是 Git 仓库但被守卫拒绝」
  // （家目录/盘根等）保留 true，只呈现不可用原因，不误报缺少仓库。
  const refusedGitWorkspace = !probe.ok && probe.reason !== REASON_GIT_REQUIRED && ledger.isGit
  const isGit = probe.ok || refusedGitWorkspace
  return {
    sessionId,
    isGit,
    workspaceRoot: probe.ok ? probe.root : ledger.workspaceRoot,
    unavailableReason: probe.ok ? null : (probe.reason ?? ledger.unavailableReason),
    turns: ledger.turns.map((turn) => {
      const truncated = turn.files.length > MAX_SUMMARY_FILES
      return {
        turn: turn.turn,
        fileCount: turn.files.length,
        insertions: turn.insertions,
        deletions: turn.deletions,
        undoneAt: turn.undoneAt ?? null,
        unavailable: turn.unavailable ?? null,
        // 失败/超限行的 refs 语义见 host/types：空 refs = 这一轮没建立过快照。
        hasBaseline: turn.beforeRef.length > 0 || turn.afterRef.length > 0,
        truncated,
        files: truncated ? turn.files.slice(0, MAX_SUMMARY_FILES) : turn.files,
        // 「不在撤销范围内」的路径：让卡片能如实标注，而不是静默漏掉。
        skippedOversized: (turn.skippedOversized ?? []).slice(0, MAX_SKIPPED_PATHS),
        skippedNestedRepos: (turn.skippedNestedRepos ?? []).slice(0, MAX_SKIPPED_PATHS),
      }
    }),
  }
})
