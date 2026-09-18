import type { InputActions, InputSessions } from './session-switch.types'
import { describe, expect, it, vi } from 'vitest'
import { waitForInputActions } from './session-switch'

function makeSessions(provideInfo?: InputSessions['provideInfo']): InputSessions {
  return {
    refresh: async () => {},
    list: { getSnapshot: () => ({ ids: [] }) },
    ...(provideInfo === undefined ? {} : { provideInfo }),
  }
}

async function wait(): Promise<void> {}

describe('waitForInputActions', () => {
  it('目标会话输入面就绪即返回', async () => {
    const actions: InputActions = { setDraft: vi.fn(), submit: vi.fn() }
    const provideInfo = vi.fn(() => ({ props: { inputActions: actions } }))

    await expect(waitForInputActions({ sessions: makeSessions(provideInfo), sessionId: 's1', wait })).resolves.toBe(actions)
    expect(provideInfo).toHaveBeenCalledWith('s1')
  })

  it('核心不提供 per-session 输入面时明确报「未就绪」，而不是 TypeError', async () => {
    await expect(waitForInputActions({ sessions: makeSessions(), sessionId: 's1', wait, attempts: 2 }))
      .rejects
      .toThrow('新工作树会话的输入服务尚未就绪')
  })

  it('输入面尚未物化时按重试次数轮询', async () => {
    const actions: InputActions = { setDraft: vi.fn(), submit: vi.fn() }
    let ready = false
    const provideInfo = vi.fn(() => (ready ? { props: { inputActions: actions } } : undefined))

    const pending = waitForInputActions({ sessions: makeSessions(provideInfo), sessionId: 's1', wait, attempts: 3 })
    ready = true

    await expect(pending).resolves.toBe(actions)
    expect(provideInfo).toHaveBeenCalledTimes(2)
  })
})
