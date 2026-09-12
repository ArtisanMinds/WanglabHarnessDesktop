import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBubbleTracker } from './bubble-tracker'

const mocks = vi.hoisted(() => ({ close: vi.fn(), toast: vi.fn(), update: vi.fn() }))
vi.mock('@/utils/toast', () => ({ toast: Object.assign(mocks.toast, { close: mocks.close, update: mocks.update }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  mocks.toast.mockImplementation(() => `toast-${mocks.toast.mock.calls.length}`)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('pet session lifecycle', () => {
  it('drops old sessions when closed and accepts the initial snapshot on wake', () => {
    const motion = vi.fn()
    const tracker = createBubbleTracker(motion)
    tracker.apply({ id: 'old', workStatus: 'waiting', running: true }, 'update')
    vi.advanceTimersByTime(100)
    expect(motion).toHaveBeenLastCalledWith('waiting')
    tracker.dispose()
    expect(mocks.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)

    tracker.apply({ id: 'new', workStatus: 'working', running: true }, 'create')
    vi.advanceTimersByTime(100)
    expect(motion).toHaveBeenLastCalledWith('working')
    expect(mocks.toast).toHaveBeenCalledTimes(2)
    tracker.dispose()
    tracker.dispose()
    expect(mocks.close).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending status changes and terminal timers on close', () => {
    const motion = vi.fn()
    const tracker = createBubbleTracker(motion)
    tracker.apply({ id: 'failed', workStatus: 'error', running: false }, 'update')
    tracker.dispose()
    vi.advanceTimersByTime(60_000)
    expect(motion).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
