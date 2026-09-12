import type { PetAsset, PetListItem, PetStatus, PresetPetItem } from '../types'
import { createLifecycleController, invoke, listenParent } from 'dsh-tauri/client'
import {
  CMD_GET_PET_ASSET,
  CMD_GET_PET_STATUS,
  CMD_IMPORT_PET,
  CMD_LIST_PETS,
  CMD_LIST_PRESET_PETS,
  CMD_SET_ACTIVE_PET,
  CMD_SET_PET_ENABLED,
  CMD_SET_PET_SIZE,
  PET_STATUS_MESSAGE,
} from '../constants'
import { beginPetStatusFetch, commitPetStatusFetch, setPetStatus } from '../store'
import { isPetStatus } from '../utils/status'

/** 媒体加载状态来自独立 WebView，晚到的命令应答不能覆盖更新的渲染结果。 */
export function registerPetStatusSync(): () => void {
  const controller = createLifecycleController()
  controller.add(listenParent((data) => {
    if (isPetStatus(data.status))
      setPetStatus(data.status)
  }, PET_STATUS_MESSAGE))
  const revision = beginPetStatusFetch()
  void fetchPetStatus().then((status) => {
    if (!controller.isDisposed())
      commitPetStatusFetch(revision, status)
  }).catch(error => console.error('[dsh-tauri-pet] fetchPetStatus failed:', error))
  return () => controller.dispose()
}

export function fetchPetStatus(): Promise<PetStatus> {
  return invoke<PetStatus>(CMD_GET_PET_STATUS)
}

export function setPetEnabled(enabled: boolean): Promise<PetStatus> {
  return invoke<PetStatus>(CMD_SET_PET_ENABLED, { enabled })
}

export function setActivePet(id: string): Promise<PetStatus> {
  return invoke<PetStatus>(CMD_SET_ACTIVE_PET, { id })
}

export async function activatePet(id: string): Promise<PetStatus> {
  await setActivePet(id)
  return setPetEnabled(true)
}

export function setPetSize(size: number): Promise<PetStatus> {
  return invoke<PetStatus>(CMD_SET_PET_SIZE, { size })
}

export function fetchPetList(): Promise<PetListItem[]> {
  return invoke<PetListItem[]>(CMD_LIST_PETS, { source: 'chat' })
}

export function fetchPetAsset(id: string): Promise<PetAsset> {
  return invoke<PetAsset>(CMD_GET_PET_ASSET, { id })
}

export function importPet(name: string, data: string): Promise<PetListItem> {
  return invoke<PetListItem>(CMD_IMPORT_PET, { name, data, source: 'chat' })
}

export function fetchPresetPets(): Promise<PresetPetItem[]> {
  return invoke<PresetPetItem[]>(CMD_LIST_PRESET_PETS)
}
