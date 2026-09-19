import type { PetStatus } from './pet.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PET_STATUS_MESSAGE } from '../constants'
import { statusFeature } from '../register/status'
import { store } from '../store'
import { isPetStatus, isPetVisible } from '../utils/status'
import { enablePet, loadPetCatalog } from './pet'
import { getPetList, postPetImport } from './pet.invoke'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('dsh-tauri/client', async () => ({
  ...await import('../../../../dsh-tauri/src/client/modules/valtio-define'),
  ...await import('../../../../dsh-tauri/src/client/controller'),
  ...await import('../../../../dsh-tauri/src/client/service/listen-parent'),
  ...await import('../../../../dsh-tauri/src/client/register'),
  invoke,
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
  invoke.mockReset()
  store.pet.setStatus(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('pet selection and render status', () => {
  it('lists and imports pets only in the application pet directory', async () => {
    await getPetList('chat')
    await postPetImport('pet.zip', 'cGV0')
    expect(invoke.mock.calls).toEqual([
      ['list_pets', { source: 'chat' }],
      ['import_pet', { name: 'pet.zip', data: 'cGV0', source: 'chat' }],
    ])
  })

  it.each([false, true])('wakes a selected custom pet even when enabled=%s', async (enabled) => {
    invoke.mockResolvedValueOnce(status({ enabled, visible: false }))
      .mockResolvedValueOnce(status({ render_id: 2, revision: 2 }))
    await enablePet({ id: 'chat:custom' })
    expect(invoke.mock.calls).toEqual([
      ['set_active_pet', { id: 'chat:custom' }],
      ['set_pet_enabled', { enabled: true }],
    ])
  })

  it('does not enable a pet whose selection failed validation', async () => {
    invoke.mockRejectedValue(new Error('PET_NOT_FOUND'))
    expect(await enablePet({ id: 'chat:missing' })).toEqual({ ok: false, error: 'PET_NOT_FOUND' })
    expect(invoke).toHaveBeenCalledTimes(1)
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
    store.pet.setStatus(status({ ready: true, revision: 3 }))
    store.pet.setStatus(status({ ready: false, revision: 2 }))
    expect(store.pet.$state.status?.ready).toBe(true)
    store.pet.setStatus(status({ ready: false, visible: false, error: 'PET_MEDIA_DECODE_FAILED', revision: 4 }))
    expect(isPetVisible(store.pet.$state.status)).toBe(false)
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
    invoke.mockReturnValue(new Promise<PetStatus>((resolve) => {
      finishFetch = resolve
    }))
    const dispose = statusFeature.call({})
    function send(next: PetStatus, source: unknown = parent): void {
      target.dispatchEvent(Object.assign(new Event('message'), {
        source,
        data: { type: PET_STATUS_MESSAGE, status: next },
      }))
    }
    send(status({ ready: true, revision: 2 }), {})
    expect(store.pet.$state.status).toBeNull()
    send(status({ ready: true, revision: 2 }))
    finishFetch(status())
    await Promise.resolve()
    expect(store.pet.$state.status?.ready).toBe(true)
    dispose()
    send(status({ visible: false, ready: false, revision: 3 }))
    expect(store.pet.$state.status?.ready).toBe(true)
  })

  it('loads only the application catalog without reading Codex directories', async () => {
    invoke.mockImplementation(async (command: string) => command === 'get_pet_status' ? status() : [])
    expect(await loadPetCatalog()).toEqual({ ok: true })
    expect(invoke.mock.calls).toEqual([
      ['get_pet_status'],
      ['list_pets', { source: 'chat' }],
      ['list_preset_pets'],
    ])
  })
})
