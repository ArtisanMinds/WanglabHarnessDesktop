/**
 * register/locale.ts — locale 安装 feature（`defineRegister` 协议）。
 *
 * `registerLocale(ctx)` 仍是实际安装器（注册 zh/en 字典 + 桥接 locale 变更到
 * `store.locale` 的 revision）；这里只把它收敛成一个 effect：
 * `ctx.effect(localeFeature, '<plugin>: locale')`，卸载时注销订阅与两份字典句柄。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { registerLocale } from '../locales'

export const localeFeature = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(registerLocale(ctx))
})
