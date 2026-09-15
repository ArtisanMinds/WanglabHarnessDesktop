import type { SettingsRow } from '../types'
import { useStore } from 'dsh-tauri/client'
import { useMemo } from 'react'
import { SETTINGS_ONBOARDING_SLOT, SETTINGS_SECTION_SLOT } from '../constants'
import { useSettingsLocale } from '../locales'
import { getSettingsSlots } from '../register/sections'
import { store } from '../store'

export type { SettingsRow } from '../types'
/**
 * hooks/sections.ts — 设置分区/引导步骤的注册表投影（只读 hooks 半区）。
 *
 * 官方 SettingsRoot 用 inject hooks（sections / onboardingSteps）把
 * 'settings.section' / 'settings.onboarding' 两个 list 槽的注册条目投影为
 * 导航行。这里做同样的事：订阅槽位 revision + locale 变更，重算
 * `entries(key) -> {id, order, label}` 排序行。
 *
 * 槽位变更不经自建订阅器：注册中心的注册/声明通知由 register/sections.ts 在
 * apply 期订阅并推进 store.slots 的 revision，本文件经 useStore 按 key 订阅。
 *
 * label 与官方一致经 resolveSlotLabel 语义解析（函数型 label 即按当前
 * locale 求值，所以 locale 变更也要触发重算）。
 *
 * 槽注册中心引用不在此持有：由 register/sections.ts 的 registerSettingsSections
 * 在 apply 时存入（卸载即清），本文件经 getSettingsSlots() 读取——槽位
 * 所有权与卸载清理只存在一处。
 */

/** 解析条目 label（镜像官方 resolveSlotLabel 语义；不依赖 ui-slots 运行时导出）。 */
function resolveLabel(label: unknown): string | undefined {
  if (typeof label === 'function')
    return String((label as () => unknown)())
  return typeof label === 'string' ? label : undefined
}

/** 带 key/order/label 的条目行（按 order 升序）。 */
function projectRows(slotKey: string): SettingsRow[] {
  const slots = getSettingsSlots()
  if (!slots)
    return []
  return slots
    .entries(slotKey as never)
    .map(e => ({
      id: e.options.id ?? '',
      order: e.options.order ?? 0,
      label: resolveLabel(e.options.label) ?? '',
    }))
    .filter(r => r.id !== '')
    .sort((a, b) => a.order - b.order)
}

/**
 * 订阅一个 list 槽的注册/声明变更。
 *
 * revision 由 register/sections.ts 的 apply 期订阅推进（见 store/modules/slots.ts），
 * 这里只经 useStore 读取并按 key 精确重渲染。
 * @param slotKey - 槽 key。
 * @returns 当前 revision。
 */
function useSlotVersion(slotKey: string): number {
  const { revisions } = useStore(store.slots)
  return revisions[slotKey] ?? 0
}

/** 设置分区导航行（'settings.section' 投影；订阅槽位与 locale 变更）。 */
export function useSettingsSectionRows(): SettingsRow[] {
  const sectionVersion = useSlotVersion(SETTINGS_SECTION_SLOT)
  useSettingsLocale()
  return useMemo(() => projectRows(SETTINGS_SECTION_SLOT), [sectionVersion])
}

/** 引导步骤行（'settings.onboarding' 投影，仅 id+order）。 */
export function useSettingsOnboardingSteps(): SettingsRow[] {
  const onboardingVersion = useSlotVersion(SETTINGS_ONBOARDING_SLOT)
  return useMemo(() => projectRows(SETTINGS_ONBOARDING_SLOT), [onboardingVersion])
}
