import type { PetResources, PetRuntimeStatus } from '../pet-runtime'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { INITIAL_PET_STATUS, loadPetResources, reportPetRender } from '../pet-runtime'

const EMPTY_ASSETS: Record<string, string> = {}
const PET_LOAD_TIMEOUT_MS = 15000

export function usePetRuntime() {
  const [status, setStatus] = useState(INITIAL_PET_STATUS)
  const [loaded, setLoaded] = useState<PetResources | null>(null)
  const activePet = status.active_pet?.trim() || null
  const visible = Boolean(activePet && status.enabled && status.visible)
  const renderId = status.render_id

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    function receive(next: PetRuntimeStatus) {
      if (!disposed)
        setStatus(previous => next.revision >= previous.revision ? next : previous)
    }
    void listen<PetRuntimeStatus>('pet://status', event => receive(event.payload))
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
        return invoke<PetRuntimeStatus>('get_pet_status').then(receive)
      })
      .catch(error => console.error('[pet] PET_STATUS_LOAD_FAILED:', error))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!activePet || !visible)
      return undefined
    let disposed = false
    void loadPetResources(activePet, renderId).then((resources) => {
      if (!disposed)
        setLoaded(resources)
    }).catch((error) => {
      if (!disposed)
        reportPetRender({ active_pet: activePet, render_id: renderId }, String(error))
    })
    return () => {
      disposed = true
    }
  }, [activePet, renderId, visible])

  useEffect(() => {
    if (!activePet || !visible || status.ready)
      return undefined
    const timer = window.setTimeout(() => {
      reportPetRender(
        { active_pet: activePet, render_id: renderId },
        'PET_MEDIA_TIMEOUT: pet media did not become ready within 15 seconds',
      )
    }, PET_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [activePet, renderId, status.ready, visible])

  const resources = loaded?.id === activePet && loaded.renderId === renderId ? loaded : null
  return {
    status,
    activePet,
    renderId,
    visible,
    isPreset: activePet !== null && !activePet.includes(':'),
    config: resources?.config ?? null,
    assets: resources?.assets ?? EMPTY_ASSETS,
    customAsset: resources?.sprite ?? null,
  }
}
