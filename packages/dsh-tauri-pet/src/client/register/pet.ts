/**
 * register/pet.ts — 「宠物」设置分区注册 + 侧栏入口 DOM 补丁安装。
 *
 * 设置分区：注册进 dsh-tauri-ui 设置侧边栏投影的 `settings.section` 槽
 * （与 dsh-tauri-session 归档分区同机制，导航行 label 用本插件文案）。
 * 侧栏入口：不走 slot（sidebar.settings 是 single 槽、已被 dsh-tauri-ui
 * 占据），用 DOM 补丁把官方 iconButton 样式的切换按钮插到设置触发器右侧。
 */
import type { Context } from '@deepseek-ai/cordis'
// 拉入 dsh-client-ui-renderer 的 `declare module '@deepseek-ai/cordis'` 增广，
// 让 `ctx.slots`（SlotRegistry）获得类型（运行时由 UI renderer 提供）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer'
import { PetSettings } from '../components/pet-settings'
import { PET_CLIENT_PLUGIN, PET_ICON_PATCH_EFFECT, PET_SECTION_EFFECT, PET_SECTION_ID, PET_SECTION_ORDER } from '../constants'
import { installSidebarPetIcon } from '../dom/sidebar-icon'
import { text } from '../locales'

export function registerPetSection(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.slots.inject('settings.section' as never, () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: PET_SECTION_ID,
            order: PET_SECTION_ORDER,
            registrant: PET_CLIENT_PLUGIN,
            label: () => text('name'),
          } as never,
          PetSettings as never,
        )),
    PET_SECTION_EFFECT,
  )
}

export function installPetIconPatch(ctx: Context): void {
  ctx.effect(() => installSidebarPetIcon(), PET_ICON_PATCH_EFFECT)
}
