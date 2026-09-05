import { describe, expect, it, vi } from 'vitest'
import { loadSchedulerRuntimeModules, unattendedToolGuardReason } from './executor.js'

describe('loadSchedulerRuntimeModules', () => {
  it('resolves DSH-owned modules through the platform loader', async () => {
    const installModelSelection = vi.fn()
    const createUserMessage = vi.fn()
    const setApprovalPolicy = vi.fn()
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-agent', { installModelSelection }],
      ['@deepseek-ai/dsh-llm', { createUserMessage }],
      ['@deepseek-ai/dsh-user-approval', { setApprovalPolicy }],
    ])
    const loader = {
      import: vi.fn(async (name: string) => modules.get(name)),
      unwrapExports: vi.fn((value: unknown) => value),
    }

    const runtime = await loadSchedulerRuntimeModules(loader)

    expect(loader.import).toHaveBeenCalledTimes(3)
    expect(loader.import).toHaveBeenNthCalledWith(1, '@deepseek-ai/dsh-agent')
    expect(loader.import).toHaveBeenNthCalledWith(2, '@deepseek-ai/dsh-llm')
    expect(loader.import).toHaveBeenNthCalledWith(3, '@deepseek-ai/dsh-user-approval')
    expect(runtime).toEqual({ installModelSelection, createUserMessage, setApprovalPolicy })
  })

  it('prefers named exports when unwrapExports selects a default export', async () => {
    const installModelSelection = vi.fn()
    const createUserMessage = vi.fn()
    const setApprovalPolicy = vi.fn()
    const loader = {
      import: vi.fn(async (name: string) => ({
        ...(name === '@deepseek-ai/dsh-agent' ? { installModelSelection } : {}),
        ...(name === '@deepseek-ai/dsh-llm' ? { createUserMessage } : {}),
        ...(name === '@deepseek-ai/dsh-user-approval' ? { setApprovalPolicy } : {}),
        default: { wrongExport: true },
      })),
      unwrapExports: vi.fn(() => ({ wrongExport: true })),
    }

    const runtime = await loadSchedulerRuntimeModules(loader)

    expect(runtime).toEqual({ installModelSelection, createUserMessage, setApprovalPolicy })
    expect(loader.unwrapExports).not.toHaveBeenCalled()
  })
})

describe('unattendedToolGuardReason', () => {
  it('allows todo_write so task lists work in unattended runs', () => {
    expect(unattendedToolGuardReason('todo_write', {
      todos: [{ content: 'step', status: 'pending' }],
    })).toBeUndefined()
  })

  it('still rejects tools outside the allowlist', () => {
    expect(unattendedToolGuardReason('ask_user_question', {}))
      .toBe('工具 \'ask_user_question\' 不在无人值守自动化允许列表中。')
  })

  it('rejects background processes for bash/pwsh but allows foreground calls', () => {
    expect(unattendedToolGuardReason('bash', { command: 'ls', run_in_background: true }))
      .toBe('无人值守运行不允许启动后台进程。')
    expect(unattendedToolGuardReason('pwsh', { command: 'ls', run_in_background: true }))
      .toBe('无人值守运行不允许启动后台进程。')
    expect(unattendedToolGuardReason('bash', { command: 'ls' })).toBeUndefined()
  })
})
