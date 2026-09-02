import type { PetStatus } from '../types'
/**
 * store/index.ts — 桌宠设置页打开态 + 状态缓存的轻量共享状态。
 *
 * 入口图标与设置页是 shell.overlay 的独立 slot 条目、由 UI renderer 各自渲染、
 * 互不感知，因此用 dsh-tauri/client 提供的 `createExternalStore`（框架无关、
 * uSES 安全，getSnapshot 保持同一引用直到真实变更）桥接两者：图标点击
 * `openPetSettings()`，设置页订阅 open 决定是否挂载；桌宠状态缓存在两者间
 * 复用（图标绿点）。不引入额外依赖，符合 AGENTS.plugins。
 */
import { createExternalStore } from 'dsh-tauri/client'

/** 共享状态结构。 */
export interface PetShared {
  /** 设置页当前是否打开。 */
  open: boolean
  /** 最近一次从桌面端读回的桌宠状态缓存（图标绿点与设置页共用）。 */
  status: PetStatus | null
}

/** dsh-tauri 外部 store（getSnapshot 稳定，uSES 安全）。 */
export const petUiStore = createExternalStore<PetShared>({ open: false, status: null })

/** 订阅变更（供 useSyncExternalStore）。 */
export function subscribePetUi(listener: () => void): () => void {
  return petUiStore.subscribe(listener)
}

/** 读取当前快照（供 useSyncExternalStore）。 */
export function getPetUiSnapshot(): PetShared {
  return petUiStore.getSnapshot()
}

/** 打开设置页。 */
export function openPetSettings(): void {
  petUiStore.set(state => ({ ...state, open: true }))
}

/** 关闭设置页。 */
export function closePetSettings(): void {
  petUiStore.set(state => ({ ...state, open: false }))
}

/** 写入桌宠状态缓存。 */
export function setPetStatus(status: PetStatus | null): void {
  petUiStore.set(state => (state.status === status ? state : { ...state, status }))
}
