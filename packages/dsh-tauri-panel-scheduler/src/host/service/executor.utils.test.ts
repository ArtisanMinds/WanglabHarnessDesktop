import { describe, expect, it, vi } from 'vitest'
import { decideRunOutcome, describeFailure, waitForTurnStart } from './executor.utils'

describe('decideRunOutcome', () => {
  it('超时优先判失败（即使 turn 已启动）', () => {
    expect(decideRunOutcome({ started: true, timedOut: true, reason: { kind: 'completed' } }))
      .toEqual({ status: 'failed', error: { code: 'timeout', message: '定时任务超过最大运行时限。' } })
  })

  it('turn 根本没启动才报「没有产生完整 turn」', () => {
    expect(decideRunOutcome({ started: false, timedOut: false, reason: undefined }))
      .toEqual({ status: 'failed', error: { code: 'no_turn_result', message: '本次定时任务没有产生完整 turn。' } })
  })

  it('turn 已启动但没有 turn/end 事件 → 成功（核心异常收尾不补写该事件）', () => {
    expect(decideRunOutcome({ started: true, timedOut: false, reason: undefined }))
      .toEqual({ status: 'succeeded' })
  })

  it('completed 视为成功', () => {
    expect(decideRunOutcome({ started: true, timedOut: false, reason: { kind: 'completed' } }))
      .toEqual({ status: 'succeeded' })
  })

  it('显式的非 completed 原因仍判失败', () => {
    const abortReason = { kind: 'aborted' }
    expect(decideRunOutcome({ started: true, timedOut: false, reason: abortReason }))
      .toEqual({ status: 'failed', error: describeFailure(abortReason) })
    expect(decideRunOutcome({ started: true, timedOut: false, reason: { kind: 'error', error: { code: 'llm_error', message: 'boom' } } }))
      .toEqual({ status: 'failed', error: { code: 'llm_error', message: 'boom' } })
  })
})

describe('waitForTurnStart', () => {
  it('seq 增长即返回 true', async () => {
    const session = { seq: 7 }
    setTimeout(() => {
      session.seq = 8
    }, 15)
    await expect(waitForTurnStart(session, 7, 500)).resolves.toBe(true)
  })

  it('始终没启动时在窗口后返回 false', async () => {
    vi.useFakeTimers()
    try {
      const session = { seq: 7 }
      const pending = waitForTurnStart(session, 7, 50)
      await vi.advanceTimersByTimeAsync(80)
      await expect(pending).resolves.toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
