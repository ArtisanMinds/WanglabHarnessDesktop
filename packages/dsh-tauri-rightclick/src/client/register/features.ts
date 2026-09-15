/**
 * register/features.ts — 客户端注册总装（`defineRegister` 协议）。
 *
 * 两项装配各自返回 disposer，统一经 `controller.add(...)` 登记、卸载时一次性释放：
 *   1. locale：注册 zh/en 字典并桥接语言切换（`text()` 每次读当前活跃语言，
 *      菜单在打开时取文案，因此不需要订阅驱动重渲染）；
 *   2. 右键菜单控制器：DOM 监听 + 全局扩展注册表租约（控制器由本 feature 托管，
 *      卸载时统一 dispose）。
 *
 * `defineRegister` 的第三个参数 `adapter` 取代了旧的 `compat(ctx)`：`sessions` /
 * `workspaces` 的跨内核服务布局漂移（Alpha 的 `uiWorkspace` / rc.2 的 `workspaces`）
 * 收敛在适配层，本插件只拿适配后的运行时面继续原有的注册。`locale` 是两份内核代
 * 都透明的成员，直接用原始 `ctx`。
 *
 * 依赖纪律（跨内核代硬约束）：本文件不得静态引用任何 `@deepseek-ai/*` 包——
 * client bundle 在 dsh Web ModuleLoader 的 factory 里运行，模块表只认识内核当前
 * 装载的模块；允许的 bare import 只有 react / dsh-tauri/client / dsh-tauri-ui/client。
 */

import type { ClientContext } from 'dsh-tauri/client'
import type { SessionsRuntimeLike, WorkspacesRuntimeLike } from '../types'
import { defineRegister } from 'dsh-tauri/client'
import { registerLocale } from '../locales'
import { registerContextMenu } from '../service/menu'

/**
 * 客户端注册特性：由 `client/index.ts` 交给 `ctx.effect(feature, '<plugin>: context menu')`。
 *
 * 适配层返回的是跨核心版本同形的服务代理（结构上满足 `SessionsRuntimeLike` /
 * `WorkspacesRuntimeLike`），但适配面刻意保持宽松（成员可选），因此这里沿用既有的
 * 运行时交界断言。
 */
export const feature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  controller.add(registerLocale(ctx))
  registerContextMenu(
    controller,
    adapter.sessions as unknown as SessionsRuntimeLike,
    adapter.workspaces as unknown as WorkspacesRuntimeLike,
  )
})
