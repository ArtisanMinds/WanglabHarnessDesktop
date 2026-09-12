import type { MarketPetItem, PetMarketSnapshot, PresetDownloadProgress } from '../types'
import { createLifecycleController, invoke } from 'dsh-tauri/client'
import { CMD_DOWNLOAD_MARKET_PET, CMD_GET_MARKET_PET_PROGRESS, CMD_LIST_PET_MARKET, PET_DOWNLOAD_POLL_MS } from '../constants'

export function initialMarketSnapshot(): PetMarketSnapshot {
  return { loading: true, pets: [], downloads: {}, error: null }
}

/** Downloads outlive the settings view; only polling belongs to this session. */
export function createPetMarketSession(
  onChange: (snapshot: PetMarketSnapshot) => void,
  onInstalled: () => Promise<void>,
) {
  const controller = createLifecycleController()
  const polling = new Set<string>()
  let state = initialMarketSnapshot()
  let requestId = 0

  function update(changes: Partial<PetMarketSnapshot>): void {
    if (controller.isDisposed())
      return
    state = { ...state, ...changes }
    onChange(state)
  }

  function progress(id: string, value: PresetDownloadProgress): void {
    update({ downloads: { ...state.downloads, [id]: value } })
  }

  async function poll(id: string): Promise<void> {
    try {
      const next = await invoke<PresetDownloadProgress>(CMD_GET_MARKET_PET_PROGRESS, { id })
      if (controller.isDisposed())
        return
      progress(id, next)
      if (next.phase === 'done') {
        polling.delete(id)
        update({ pets: state.pets.map(pet => pet.id === id ? { ...pet, installed: true, phase: 'done' } : pet) })
        await onInstalled().catch(error => update({ error: String(error) }))
      }
      else if (next.phase === 'failed' || next.phase === 'idle') {
        polling.delete(id)
        if (next.phase === 'idle')
          progress(id, { ...next, phase: 'failed', error: 'PET_MARKET_PROGRESS_LOST' })
      }
      else {
        controller.timeout(() => {
          void poll(id)
        }, PET_DOWNLOAD_POLL_MS)
      }
    }
    catch (error) {
      polling.delete(id)
      progress(id, { phase: 'failed', received: 0, total: 0, error: String(error) })
    }
  }

  function resume(id: string): void {
    if (controller.isDisposed() || polling.has(id))
      return
    polling.add(id)
    void poll(id)
  }

  async function refresh(force = true): Promise<void> {
    const request = ++requestId
    const previousDownloads = state.downloads
    update({ loading: true, error: null })
    try {
      const pets = await invoke<MarketPetItem[]>(CMD_LIST_PET_MARKET, { refresh: force })
      if (controller.isDisposed() || request !== requestId)
        return
      // A catalog reply requested before an install must not undo the completed install.
      update({
        pets: pets.map((pet) => {
          if (state.downloads[pet.id]?.phase === 'done' && previousDownloads[pet.id]?.phase !== 'done')
            return { ...pet, installed: true, phase: 'done' }
          return pet
        }),
        loading: false,
      })
      for (const pet of state.pets) {
        if (pet.phase === 'downloading' || pet.phase === 'extracting' || pet.phase === 'failed') {
          progress(pet.id, { phase: pet.phase, received: 0, total: pet.size })
          resume(pet.id)
        }
      }
    }
    catch (error) {
      if (request === requestId)
        update({ loading: false, error: String(error) })
    }
  }

  async function download(id: string): Promise<void> {
    const pet = state.pets.find(pet => pet.id === id)
    const phase = state.downloads[id]?.phase
    if (controller.isDisposed() || !pet || pet.installed || phase === 'downloading' || phase === 'extracting')
      return
    progress(id, { phase: 'downloading', received: 0, total: pet.size })
    try {
      await invoke<void>(CMD_DOWNLOAD_MARKET_PET, { id })
      resume(id)
    }
    catch (error) {
      if (String(error).includes('PET_MARKET_BUSY')) {
        resume(id)
      }
      else if (String(error).includes('PET_ALREADY_IMPORTED')) {
        progress(id, { phase: 'done', received: 0, total: 0 })
        await refresh(false)
        if (!controller.isDisposed())
          await onInstalled().catch(error => update({ error: String(error) }))
      }
      else {
        progress(id, { phase: 'failed', received: 0, total: pet.size, error: String(error) })
      }
    }
  }

  return { refresh, download, dispose: controller.dispose }
}
