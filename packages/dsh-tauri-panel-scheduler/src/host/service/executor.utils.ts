import type { RunStatus } from '../types'

/** 启动窗口：排队的 followup 被 driver 取走前的等待上限。 */
export const SCHEDULER_TURN_START_TIMEOUT_MS = 30_000

const TURN_START_POLL_MS = 10

export interface RunFailure {
  code: string
  message: string
}

/**
 * 等待这一轮真正开始（`session.seq` 增长即视为已启动）。
 *
 * `whenIdle()` 表示「当前没有 driver」，排队的 followup 被取走之前它就会立刻兑现，
 * 因此直接在 followup 后等空闲会读到空事件集，把跑得好好的任务判成没产生 turn。
 */
export async function waitForTurnStart(
  session: { seq: number },
  firstSeq: number,
  timeoutMs = SCHEDULER_TURN_START_TIMEOUT_MS,
): Promise<boolean> {
  const deadlineAt = Date.now() + timeoutMs
  while (session.seq <= firstSeq) {
    if (Date.now() >= deadlineAt)
      return false
    await new Promise(resolve => setTimeout(resolve, TURN_START_POLL_MS))
  }
  return true
}

function reasonOf(reason: Record<string, unknown>): Record<string, unknown> {
  const nested = reason.error
  return typeof nested === 'object' && nested !== null ? nested as Record<string, unknown> : {}
}

/**
 * turn 收尾原因 → 失败文案。
 *
 * `turn/end` 缺失不算失败：核心在异常收尾（取消 / 中断 / 崩溃修复）时可能不补写，
 * 与 `agent/status → idle` 的兜底语义保持一致（见 pet / turnrewind 的同名处理）。
 */
export function describeFailure(reason: Record<string, unknown> | undefined): RunFailure {
  if (!reason)
    return { code: 'no_turn_result', message: '本次定时任务没有产生完整 turn。' }
  if (reason.kind === 'error') {
    const error = reasonOf(reason)
    return {
      code: typeof error.code === 'string' ? error.code : 'agent_error',
      message: typeof error.message === 'string' ? error.message : '定时任务 Agent 执行失败。',
    }
  }
  return { code: `turn_${String(reason.kind)}`, message: `定时任务以 ${String(reason.kind)} 结束。` }
}

/** 收尾判定：显式的非 `completed` 原因才判失败，超时与「根本没启动」各自单独归类。 */
export function decideRunOutcome(input: {
  started: boolean
  timedOut: boolean
  reason: Record<string, unknown> | undefined
}): { status: RunStatus, error?: RunFailure } {
  if (input.timedOut)
    return { status: 'failed', error: { code: 'timeout', message: '定时任务超过最大运行时限。' } }
  if (!input.started)
    return { status: 'failed', error: describeFailure(undefined) }
  if (input.reason === undefined || input.reason.kind === 'completed')
    return { status: 'succeeded' }
  return { status: 'failed', error: describeFailure(input.reason) }
}
