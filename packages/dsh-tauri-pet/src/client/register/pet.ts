/**
 * register/pet.ts — 桌宠入口图标 + 独立设置页注册：装入 layout 声明的
 * `shell.overlay` 槽（list/root 多胜者，允许并排多个条目）。
 *
 * 两个独立 id：
 *   - PET_ICON_SLOT_ID      侧栏宠物入口小图标（点击打开设置页）
 *   - PET_SETTINGS_SLOT_ID  独立设置页（仅打开时挂载）
 */
import type { Context } from '@deepseek-ai/cordis'
// 拉入 dsh-client-ui-renderer 的 `declare module '@deepseek-ai/cordis'` 增广，
// 让 `ctx.slots`（SlotRegistry）获得类型（运行时由 UI renderer 提供）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer'
import { PetIcon } from '../components/pet-icon'
import { PetSettings } from '../components/pet-settings'
import { PET_ICON_SLOT_ID, PET_SETTINGS_SLOT_ID } from '../constants'

export function installPetIcon(ctx: Context): void {
  ctx.slots.inject('shell.overlay' as never, () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: PET_ICON_SLOT_ID, order: 90, registrant: 'dsh-tauri-pet' } as never,
      PetIcon as never,
    ))
}

export function installPetSettings(ctx: Context): void {
  ctx.slots.inject('shell.overlay' as never, () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: PET_SETTINGS_SLOT_ID, order: 91, registrant: 'dsh-tauri-pet' } as never,
      PetSettings as never,
    ))
}
