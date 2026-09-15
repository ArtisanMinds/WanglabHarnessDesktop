/**
 * register/features.ts — 客户端注册总装（`defineRegister` 协议）。
 *
 * 四项装配各自返回 disposer，统一经 `controller.add(...)` 登记、卸载时一次性释放：
 *   1. capabilities：装入能力探测所需的上下文（「打开文件 / 审核」是否可用的判据）；
 *   2. locale：注册 zh/en 字典并把语言切换桥接到 store.locale 的 revision；
 *   3. 槽位 A：`conversation.chat.turnTail`（chain，priority -1）的变更卡片；
 *   4. 槽位 B：`conversation.input.dock`（list）的运行中提示条。
 *
 * `defineRegister` 的 `adapter` 取代了旧的 `compat(ctx)`：服务布局漂移（sessions /
 * workspaces 的跨内核投影）收敛在适配层，本插件只需拿适配后的上下文继续原有的注册。
 * 四项注册只读 `locale` / `slots` / `reflect`（两份迁移都透明的成员），因此与
 * 迁移前的 `compat(ctx)` 代理逐字等价。
 *
 * 依赖纪律（跨内核代硬约束）：本文件不得静态引用任何 `@deepseek-ai/*` 包——
 * client bundle 在 dsh Web ModuleLoader 的 factory 里运行，模块表只认识内核当前
 * 装载的模块；允许的 bare import 只有 react / dsh-tauri/client / dsh-tauri-ui/client。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { registerCapabilities } from '../capabilities'
import { registerLocale } from '../locales'
import { registerRunningChangesChip } from './running-chip'
import { registerTurnChangesCard } from './turn-tail'

/**
 * 客户端注册特性：由 `client/index.ts` 交给 `ctx.effect(feature, '<plugin>: features')`。
 *
 * `this` 在 effect 运行时是客户端上下文（cordis 的 `callback.call(ctx)`），
 * 因此这里不显式绑定 ctx。
 */
export const feature = defineRegister<ClientContext>((controller, _ctx, adapter) => {
  // 适配后的上下文投影：与迁移前的 `compat(ctx)` 同口径（见文件头注释）。
  const cx = adapter.ctx as unknown as ClientContext
  controller.add(registerCapabilities(cx))
  controller.add(registerLocale(cx))
  controller.add(registerTurnChangesCard(cx))
  controller.add(registerRunningChangesChip(cx))
})
