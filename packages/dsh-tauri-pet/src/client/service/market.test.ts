import type { MarketPetItem, PetMarketSnapshot, PresetDownloadProgress } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPetMarketSession, initialMarketSnapshot } from './market'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('dsh-tauri/client', async () => ({
  ...await import('../../../../dsh-tauri/src/client/controller'),
  invoke,
}))

function pet(id = 'codenono', phase: PresetDownloadProgress['phase'] = 'idle'): MarketPetItem {
  return {
    id,
    name: id,
    description: '',
    author: { name: 'DDDq', url: `https://codex-pets.net/#/pets/${id}` },
    sourceUrl: `https://codex-pets.net/#/pets/${id}`,
    license: 'MIT',
    licenseUrl: '',
    previewUrl: '',
    spritesheetUrl: '',
    spriteVersion: 1,
    archiveUrl: '',
    sha256: '',
    size: 100,
    installed: false,
    phase,
  }
}

function fixture() {
  let snapshot: PetMarketSnapshot = initialMarketSnapshot()
  const onChange = vi.fn((value: PetMarketSnapshot) => {
    snapshot = value
  })
  const onInstalled = vi.fn(async () => {})
  const session = createPetMarketSession(onChange, onInstalled)
  return { session, onChange, onInstalled, current: () => snapshot }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  invoke.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('pet market lifecycle', () => {
  it('does not fetch on construction and preserves the catalog order and authors', async () => {
    const { session, current } = fixture()
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValue([pet('nimbus'), pet('codenono')])
    await session.refresh(false)
    expect(invoke).toHaveBeenCalledWith('list_pet_market', { refresh: false })
    expect(current().pets.map(item => item.id)).toEqual(['nimbus', 'codenono'])
    expect(current().pets[0].author.name).toBe('DDDq')
    expect(current().loading).toBe(false)
    session.dispose()
  })

  it('recovers from a failed catalog request through explicit refresh', async () => {
    const { session, current } = fixture()
    invoke.mockRejectedValueOnce(new Error('PET_MARKET_FETCH_FAILED'))
      .mockResolvedValueOnce([pet()])
    await session.refresh(false)
    expect(current().error).toContain('PET_MARKET_FETCH_FAILED')
    await session.refresh()
    expect(current().error).toBeNull()
    expect(current().pets).toHaveLength(1)
    expect(invoke).toHaveBeenLastCalledWith('list_pet_market', { refresh: true })
    session.dispose()
  })

  it('resumes a background download on remount without starting it again', async () => {
    const { session, current, onInstalled } = fixture()
    invoke.mockResolvedValueOnce([pet('codenono', 'downloading')])
      .mockResolvedValueOnce({ phase: 'extracting', received: 100, total: 100 })
      .mockResolvedValueOnce({ phase: 'done', received: 0, total: 0 })
    await session.refresh(false)
    await vi.advanceTimersByTimeAsync(400)
    expect(current().pets[0].installed).toBe(true)
    expect(onInstalled).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'download_market_pet')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    session.dispose()
  })

  it('rejects duplicate clicks and retries a checksum failure without selecting a pet', async () => {
    const { session, current, onInstalled } = fixture()
    const accepted = deferred<void>()
    invoke.mockResolvedValueOnce([pet()])
      .mockReturnValueOnce(accepted.promise)
      .mockResolvedValueOnce({ phase: 'failed', received: 0, total: 100, error: 'PET_MARKET_DIGEST_MISMATCH' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ phase: 'done', received: 0, total: 0 })
    await session.refresh(false)
    const pending = session.download('codenono')
    await session.download('codenono')
    expect(invoke.mock.calls.filter(([cmd]) => cmd === 'download_market_pet')).toHaveLength(1)
    accepted.resolve()
    await pending
    await vi.advanceTimersByTimeAsync(0)
    expect(current().downloads.codenono.error).toBe('PET_MARKET_DIGEST_MISMATCH')
    expect(current().pets[0].installed).toBe(false)
    await session.download('codenono')
    await vi.advanceTimersByTimeAsync(0)
    expect(current().pets[0].installed).toBe(true)
    expect(onInstalled).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.some(([cmd]) => cmd === 'set_active_pet' || cmd === 'import_pet')).toBe(false)
    session.dispose()
  })

  it('discards late progress and stops timers when the view is closed', async () => {
    const { session, onChange, onInstalled } = fixture()
    const progress = deferred<PresetDownloadProgress>()
    invoke.mockResolvedValueOnce([pet('codenono', 'downloading')]).mockReturnValueOnce(progress.promise)
    await session.refresh(false)
    session.dispose()
    onChange.mockClear()
    progress.resolve({ phase: 'done', received: 0, total: 0 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).not.toHaveBeenCalled()
    expect(onInstalled).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a completed installation when an older list reply arrives late', async () => {
    const { session, current } = fixture()
    const listing = deferred<MarketPetItem[]>()
    invoke.mockResolvedValueOnce([pet('codenono', 'downloading')])
      .mockResolvedValueOnce({ phase: 'extracting', received: 100, total: 100 })
      .mockReturnValueOnce(listing.promise)
      .mockResolvedValueOnce({ phase: 'done', received: 0, total: 0 })
    await session.refresh(false)
    const refresh = session.refresh()
    await vi.advanceTimersByTimeAsync(400)
    listing.resolve([pet()])
    await refresh
    expect(current().pets[0].installed).toBe(true)
    session.dispose()
  })
})
