import type { PetAsset, PetListItem, PetSource, PetStatus, PresetDownloadProgress, PresetPetItem } from '../types'
import { createLifecycleController, invokeBridgedTauri } from 'dsh-tauri/client'
import {
  CMD_DOWNLOAD_PRESET_PET,
  CMD_GET_PET_ASSET,
  CMD_GET_PET_STATUS,
  CMD_GET_PRESET_DOWNLOAD_PROGRESS,
  CMD_HIDE_PET,
  CMD_IMPORT_PET,
  CMD_LIST_PETS,
  CMD_LIST_PRESET_PETS,
  CMD_PUSH_PET_SESSION,
  CMD_SET_ACTIVE_PET,
  CMD_SET_PET_ENABLED,
  CMD_SET_PET_SIZE,
  CMD_SHOW_PET,
  PET_STATUS_MESSAGE,
  PET_STATUS_SOURCE,
} from '../constants'
import { beginPetStatusFetch, commitPetStatusFetch, setPetStatus } from '../store'
import { isPetStatus } from '../utils/status'

/** 加载结果来自独立 WebView，必须持续同步，不能只缓存按钮命令的返回值。 */
export function installPetStatusSync(): () => void {
  const controller = createLifecycleController()
  function receiveStatus(event: MessageEvent<unknown>): void {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object')
      return
    const data = event.data as { source?: unknown, type?: unknown, status?: unknown }
    if (data.source === PET_STATUS_SOURCE && data.type === PET_STATUS_MESSAGE && isPetStatus(data.status))
      setPetStatus(data.status)
  }
  window.addEventListener('message', receiveStatus)
  controller.add(() => window.removeEventListener('message', receiveStatus))
  const revision = beginPetStatusFetch()
  void fetchPetStatus().then((status) => {
    if (!controller.isDisposed())
      commitPetStatusFetch(revision, status)
  }).catch(error => console.error('[dsh-tauri-pet] fetchPetStatus failed:', error))
  return () => controller.dispose()
}

export function fetchPetStatus(): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_GET_PET_STATUS)
}

export function setPetEnabled(enabled: boolean): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SET_PET_ENABLED, { enabled })
}

export function setActivePet(id: string): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SET_ACTIVE_PET, { id })
}

/** 自定义与预设选择都唤醒窗口，包括之前已启用但临时收起的情况。 */
export async function activatePet(id: string): Promise<PetStatus> {
  await setActivePet(id)
  return setPetEnabled(true)
}

export function setPetSize(size: number): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SET_PET_SIZE, { size })
}

export function showPet(): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SHOW_PET)
}

export function hidePet(): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_HIDE_PET)
}

export function fetchPetList(source: PetSource): Promise<PetListItem[]> {
  return invokeBridgedTauri<PetListItem[]>(CMD_LIST_PETS, { source })
}

export function fetchPetAsset(id: string): Promise<PetAsset> {
  return invokeBridgedTauri<PetAsset>(CMD_GET_PET_ASSET, { id })
}

export function importPet(name: string, data: string): Promise<PetListItem> {
  return invokeBridgedTauri<PetListItem>(CMD_IMPORT_PET, { name, data })
}

/** Forward one untouched DSH session snapshot to the pet webview. */
export function pushPetSession(
  action: 'create' | 'update' | 'remove',
  session: Record<string, unknown>,
): Promise<void> {
  return invokeBridgedTauri<void>(CMD_PUSH_PET_SESSION, { action, session })
}

/** 预设宠物清单（resources/preset-pets.json + 本机安装状态）。 */
export function fetchPresetPets(): Promise<PresetPetItem[]> {
  return invokeBridgedTauri<PresetPetItem[]>(CMD_LIST_PRESET_PETS)
}

/** 开始下载并安装预设宠物（后台执行；进度用 fetchPresetDownloadProgress 轮询）。 */
export function downloadPresetPet(id: string): Promise<void> {
  return invokeBridgedTauri<void>(CMD_DOWNLOAD_PRESET_PET, { id })
}

/** 查询预设宠物下载进度。 */
export function fetchPresetDownloadProgress(id: string): Promise<PresetDownloadProgress> {
  return invokeBridgedTauri<PresetDownloadProgress>(CMD_GET_PRESET_DOWNLOAD_PROGRESS, { id })
}
