import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { SettingsSidebar } from '../components/sidebar'
import {
  SETTINGS_REGISTRANT,
  SETTINGS_SHELL_OVERLAY_SLOT,
  SETTINGS_SIDEBAR_ID,
} from '../constants'

/**
 * register/sidebar.ts — shell.overlay 设置侧边栏条目注册（defineRegister）。
 *
 * shell.overlay 由 ui-layout 的 AppFrame 声明；alpha 要求注册进入前该槽已
 * 由父条目 children 表声明，故用 inject 等其声明 live 后再注册。inject 的
 * 撤销句柄交给 controller：插件卸载时随 effect 一并撤销（与旧 ctx.effect 同语义）。
 */
export const registerSettingsSidebar = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(
    ctx.slots.inject(SETTINGS_SHELL_OVERLAY_SLOT, () =>
      ctx.slots.register(
        { name: SETTINGS_SHELL_OVERLAY_SLOT, id: SETTINGS_SIDEBAR_ID, registrant: SETTINGS_REGISTRANT, inject: () => ({}) } as never,
        SettingsSidebar as never,
      )),
  )
})
