import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SETTINGS_ONBOARDING_SLOT, SETTINGS_SECTION_SLOT } from '../constants'
import { store } from '../store'

/**
 * register/sections.ts — 'settings.section' / 'settings.onboarding' 投影的
 * 安装器半区：持有槽注册中心的模块引用（slotsRef），供 hooks/sections.ts
 * 的只读投影 hooks 在 render 期经 getSettingsSlots() 读取。
 *
 * 引用所有权、变更订阅与卸载清理只存在本文件：registerSettingsSections 在
 * apply 时把 ctx.slots 写入并订阅两个 list 槽（变更即推进 store.slots 对应
 * revision），返回的卸载函数在插件卸载后取消订阅并清除模块引用，避免跨实例残留。
 */

/** apply 时存入的槽注册中心（hooks/sections.ts 在 render 期经它投影）。 */
type SettingsSlots = SlotRegistry

/** 被投影的槽位 key（与 hooks/sections.ts 的两个投影一一对应）。 */
const PROJECTED_SLOT_KEYS = [SETTINGS_SECTION_SLOT, SETTINGS_ONBOARDING_SLOT] as const

let slotsRef: SettingsSlots | undefined

/**
 * 在 apply 里安装：把 ctx.slots 引用留给投影 hooks，并订阅槽位变更推进 store。
 * @param slots - 客户端 slots 注册中心（ctx.slots）。
 * @returns 卸载函数（取消订阅并清除模块引用，避免跨实例残留）。
 */
export function registerSettingsSections(slots: SettingsSlots): () => void {
  slotsRef = slots
  const unsubscribes = PROJECTED_SLOT_KEYS.map(key =>
    slots.subscribe(key as never, () => store.slots.bump(key)))
  return () => {
    for (const unsubscribe of unsubscribes)
      unsubscribe()
    if (slotsRef === slots)
      slotsRef = undefined
  }
}

/** 读取当前槽注册中心（hooks/sections.ts 投影只读半区用）。 */
export function getSettingsSlots(): SettingsSlots | undefined {
  return slotsRef
}
