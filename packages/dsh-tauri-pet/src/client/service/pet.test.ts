import type { PetStatus } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PET_STATUS_MESSAGE, PET_STATUS_SOURCE } from '../constants'
import { getPetUiSnapshot, setPetStatus } from '../store'
import { isPetStatus, isPetVisible } from '../utils/status'
import { activatePet, installPetStatusSync } from './pet'

const { invokeBridgedTauri } = vi.hoisted(() => ({ invokeBridgedTauri: vi.fn() }))
vi.mock('dsh-tauri/client', async () => ({
  ...await import('../../../../dsh-tauri/src/client/store'),
  ...await import('../../../../dsh-tauri/src/client/controller'),
  invokeBridgedTauri,
}))

function status(overrides: Partial<PetStatus> = {}): PetStatus {
  return {
    active_pet: 'chat:custom',
    enabled: true,
    visible: true,
    ready: false,
    error: null,
    render_id: 1,
    revision: 1,
    ...overrides,
  }
}

beforeEach(() => {
  invokeBridgedTauri.mockReset()
  setPetStatus(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('pet selection and render status', () => {
  it.each([false, true])('wakes a selected custom pet even when enabled=%s', async (enabled) => {
    invokeBridgedTauri.mockResolvedValueOnce(status({ enabled, visible: false }))
      .mockResolvedValueOnce(status({ render_id: 2, revision: 2 }))
    await activatePet('chat:custom')
    expect(invokeBridgedTauri.mock.calls).toEqual([
      ['set_active_pet', { id: 'chat:custom' }],
      ['set_pet_enabled', { enabled: true }],
    ])
  })

  it('does not enable a pet whose selection failed validation', async () => {
    invokeBridgedTauri.mockRejectedValue(new Error('PET_NOT_FOUND'))
    await expect(activatePet('chat:missing')).rejects.toThrow('PET_NOT_FOUND')
    expect(invokeBridgedTauri).toHaveBeenCalledTimes(1)
  })

  it('lights the icon only for a selected, visible, decoded pet', () => {
    expect(isPetVisible(null)).toBe(false)
    expect(isPetVisible(status())).toBe(false)
    expect(isPetVisible(status({ ready: true }))).toBe(true)
    for (const overrides of [{ active_pet: null }, { enabled: false }, { visible: false }, { error: 'PET_MEDIA_DECODE_FAILED' }])
      expect(isPetVisible(status({ ready: true, ...overrides }))).toBe(false)
    expect(isPetStatus({ enabled: true, visible: true })).toBe(false)
  })

  it('keeps newer render results when an earlier command reply arrives late', () => {
    setPetStatus(status({ ready: true, revision: 3 }))
    setPetStatus(status({ ready: false, revision: 2 }))
    expect(getPetUiSnapshot().status?.ready).toBe(true)
    setPetStatus(status({ ready: false, visible: false, error: 'PET_MEDIA_DECODE_FAILED', revision: 4 }))
    expect(isPetVisible(getPetUiSnapshot().status)).toBe(false)
  })

  it('receives host render events, rejects other senders, and cleans up on disposal', async () => {
    const target = new EventTarget()
    const parent = {}
    vi.stubGlobal('window', {
      parent,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    })
    let finishFetch: (value: PetStatus) => void = () => {}
    invokeBridgedTauri.mockReturnValue(new Promise<PetStatus>((resolve) => {
      finishFetch = resolve
    }))
    const dispose = installPetStatusSync()
    function send(next: PetStatus, source: unknown = parent): void {
      target.dispatchEvent(Object.assign(new Event('message'), {
        source,
        data: { source: PET_STATUS_SOURCE, type: PET_STATUS_MESSAGE, status: next },
      }))
    }
    send(status({ ready: true, revision: 2 }), {})
    expect(getPetUiSnapshot().status).toBeNull()
    send(status({ ready: true, revision: 2 }))
    finishFetch(status())
    await Promise.resolve()
    expect(getPetUiSnapshot().status?.ready).toBe(true)
    dispose()
    send(status({ visible: false, ready: false, revision: 3 }))
    expect(getPetUiSnapshot().status?.ready).toBe(true)
  })
})
