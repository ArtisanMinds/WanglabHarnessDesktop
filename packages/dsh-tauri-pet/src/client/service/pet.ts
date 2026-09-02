/**
 * service/pet.ts — 桌宠 Tauri 命令的桥客户端。
 *
 * dsh 界面运行在 iframe 内，无 `__TAURI_INTERNALS__`，因此所有命令都经
 * `dsh-tauri/client` 的 `invokeBridgedTauri` 转发到宿主（主 webview）监听器，
 * 由宿主调用 `@tauri-apps/api/core` 的 `invoke` 并把结果回传（见桌面端
 * `src/hooks/use-iframe-invoke.ts`）。命令名与桌面端 bridge/pet.rs 的
 * `#[tauri::command]` 一一对应。
 */
import { invokeBridgedTauri } from 'dsh-tauri/client'
import type { PetStatus } from '../types'
import { CMD_GET_PET_STATUS, CMD_HIDE_PET, CMD_SET_ACTIVE_PET, CMD_SET_PET_ENABLED, CMD_SHOW_PET } from '../constants'

/** 查询桌宠当前状态（启用与否 + 当前选择）。 */
export function fetchPetStatus(): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_GET_PET_STATUS)
}

/** 启用/停用桌宠（同步外置窗口显示状态）。 */
export function setPetEnabled(enabled: boolean): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SET_PET_ENABLED, { enabled })
}

/** 选择桌宠模型包。 */
export function setActivePet(id: string): Promise<PetStatus> {
  return invokeBridgedTauri<PetStatus>(CMD_SET_ACTIVE_PET, { id })
}

/** 显示桌宠窗口（需已启用）。 */
export function showPet(): Promise<void> {
  return invokeBridgedTauri<void>(CMD_SHOW_PET)
}

/** 隐藏桌宠窗口（不改 enabled）。 */
export function hidePet(): Promise<void> {
  return invokeBridgedTauri<void>(CMD_HIDE_PET)
}