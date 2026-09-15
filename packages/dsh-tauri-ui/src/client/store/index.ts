import type { SettingsUiState } from '../types'
import { useStore } from 'dsh-tauri/client'
import { RAIL_WIDTH_MAX, RAIL_WIDTH_MIN } from '../constants'
import { locale } from './modules/locale'
import { settings } from './modules/settings'
import { slots } from './modules/slots'

export { RAIL_WIDTH_DEFAULT } from '../constants'
export type { SettingsUiState } from '../types'

/**
 * store/index.ts — dsh-tauri-ui 客户端共享状态的统一出口（valtio-define 域存储聚合）。
 *
 * 每个域一份 `modules/<domain>.ts`（state 只放数据、写入走 actions），本文件只做
 * 聚合与旧调用点兼容：触发器/侧边栏/拖拽 hooks 继续用下面这些薄包装函数名，
 * 组件内订阅统一走 `useStore(store.<domain>)`。
 */
export const store = {
  locale,
  settings,
  slots,
}

/**
 * 钳制到左栏合约区间（镜像官方 clampWidth 语义）。
 */
export function clampRailWidth(px: number): number {
  return Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, px))
}

/** 打开侧边栏；可选直接跳到一个设置分区（onboarding 的 openSection 用）。 */
export function openSettings(sectionId?: string): void {
  store.settings.openAt(sectionId)
}

/** 关闭侧边栏并复位视图状态（与官方 close 的复位语义一致；宽度也即忘）。 */
export function closeSettings(): void {
  store.settings.close()
}

/** 切换左栏当前分区。 */
export function selectSection(id: string): void {
  store.settings.select(id)
}

/** 拖拽中实时写入左栏宽度（调用方已按合约钳制）。 */
export function setRailWidth(px: number): void {
  store.settings.setRailWidth(px)
}

/**
 * 组件内订阅共享 UI 状态。
 *
 * `sync: true`：搜索框是受控输入，valtio 默认的批量通知可能丢光标位置——
 * 这里保持旧 uSES 的同步语义。
 */
export function useSettingsUi(): SettingsUiState {
  return useStore(store.settings, { sync: true })
}
