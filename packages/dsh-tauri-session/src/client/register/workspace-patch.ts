/**
 * register/workspace-patch.ts — 工作区浏览器补丁 feature（`defineRegister` 协议）。
 *
 * 补丁本体在 `dom/workspace-patch.ts`（MutationObserver + capture 监听）；这里只负责
 * 从适配层取会话/工作区运行时面并把它登记进 controller，卸载即还原 DOM 补丁。
 *
 * 适配层返回的是跨核心版本同形的服务代理（结构上满足 `SessionsRuntimeLike` /
 * `WorkspacesRuntimeLike`），但适配面刻意保持宽松（成员可选），因此这里沿用既有的
 * 运行时交界断言。
 */

import type { ClientContext } from 'dsh-tauri/client'
import type { SessionsRuntimeLike, WorkspacesRuntimeLike } from '../types'
import { defineRegister } from 'dsh-tauri/client'
import { registerWorkspaceArchivePatch } from '../dom/workspace-patch'

export const workspacePatchFeature = defineRegister<ClientContext>((controller, _ctx, adapter) => {
  controller.add(registerWorkspaceArchivePatch(
    adapter.workspaces as unknown as WorkspacesRuntimeLike,
    adapter.sessions as unknown as SessionsRuntimeLike,
  ))
})
