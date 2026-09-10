import type { PetRuntimeStatus } from '../pet-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBubble } from './use-bubble'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  effect: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
  setStatus: vi.fn(),
  toast: vi.fn(),
  update: vi.fn(),
}))

vi.mock('react', () => ({
  useEffect: mocks.effect,
  useState: () => [undefined, mocks.setStatus],
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('@/utils/toast', () => ({ toast: Object.assign(mocks.toast, { close: mocks.close, update: mocks.update }) }))

const listeners = new Map<string, (event: { payload: unknown }) => void>()
let dispose: (() => void) | undefined
let revision = 0

function petStatus(visible: boolean, statusRevision = ++revision): PetRuntimeStatus {
  return {
    active_pet: 'chat:test',
    enabled: true,
    visible,
    ready: visible,
    error: null,
    pet_size: 100,
    render_id: 1,
    revision: statusRevision,
  }
}

function emit(event: string, payload: unknown) {
  listeners.get(event)?.({ payload })
}

async function mount(visible = true) {
  mocks.invoke.mockResolvedValue(petStatus(visible))
  // eslint-disable-next-line react/rules-of-hooks -- Hooks are driven by the mocked lifecycle.
  useBubble()
  await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('get_pet_status'))
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  revision = 0
  mocks.effect.mockImplementation((effect: () => () => void) => {
    dispose = effect()
  })
  mocks.listen.mockImplementation(async (event: string, callback: (event: { payload: unknown }) => void) => {
    listeners.set(event, callback)
    return () => listeners.delete(event)
  })
  mocks.toast.mockImplementation(() => `toast-${mocks.toast.mock.calls.length}`)
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  listeners.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('pet session visibility', () => {
  it('clears an active session on hide and accepts fresh events after waking', async () => {
    await mount()
    emit('session:update', { id: 'old', workStatus: 'working', running: true })
    vi.advanceTimersByTime(100)
    expect(mocks.setStatus).toHaveBeenLastCalledWith('working')

    emit('pet://status', petStatus(false))
    expect(mocks.setStatus).toHaveBeenLastCalledWith(undefined)
    expect(mocks.close).toHaveBeenCalledWith('toast-1')
    expect(vi.getTimerCount()).toBe(0)

    // 隐藏前已排队的事件不能重建过期气泡。
    emit('session:update', { id: 'old', workStatus: 'working', running: true })
    vi.advanceTimersByTime(100)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.setStatus).toHaveBeenLastCalledWith(undefined)

    emit('pet://status', petStatus(true))
    vi.advanceTimersByTime(100)
    expect(mocks.setStatus).toHaveBeenLastCalledWith(undefined)
    emit('session:update', { id: 'new', workStatus: 'thinking', running: true })
    vi.advanceTimersByTime(100)
    expect(mocks.setStatus).toHaveBeenLastCalledWith('thinking')
    expect(mocks.toast).toHaveBeenCalledTimes(2)
  })

  it('cancels pending aggregate updates when the pet is disabled', async () => {
    await mount()
    emit('session:update', { id: 'pending', workStatus: 'waiting' })
    emit('pet://status', { ...petStatus(true), enabled: false })
    vi.advanceTimersByTime(1000)
    expect(mocks.setStatus).toHaveBeenLastCalledWith(undefined)
    expect(mocks.setStatus).not.toHaveBeenCalledWith('waiting')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores stale visibility events and starts hidden without session bubbles', async () => {
    await mount(false)
    emit('pet://status', petStatus(true, 0))
    emit('session:update', { id: 'hidden', running: true })
    vi.advanceTimersByTime(100)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.setStatus).toHaveBeenLastCalledWith(undefined)
  })

  it('preserves active state on a size update and releases all listeners on unmount', async () => {
    await mount()
    emit('session:update', { id: 'active', workStatus: 'working' })
    vi.advanceTimersByTime(100)
    emit('pet://status', { ...petStatus(true), pet_size: 25 })
    expect(mocks.setStatus).toHaveBeenLastCalledWith('working')
    expect(mocks.close).not.toHaveBeenCalled()
    emit('session:update', { id: 'terminal', workStatus: 'success' })
    dispose?.()
    dispose = undefined
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(mocks.close).toHaveBeenCalledTimes(2)
  })
})
