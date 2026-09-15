/**
 * register/dialog.ts — 检出本地 / 放弃更改 两个模态框的 slot 注册。
 *
 * 注册进 shell.overlay（list）新增一个条目；inject 句柄由 `defineRegister` 的控制器
 * 统一 dispose。官方服务面（会话 / 工作区）一律经第三个参数 `adapter` 取用：旧核的
 * `compat(ctx)` 已废弃。
 */

import type { ClientContext } from 'dsh-tauri/client'
import type { WorktreeDialogProps } from '../types'
import { defineRegister } from 'dsh-tauri/client'
import { WorktreeDialog } from '../components/dialog'
import { DIALOG_ID, SHELL_OVERLAY_SLOT, WORKTREE_PLUGIN_NAME } from '../constants'

export const dialogFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  // shell.overlay 由 ui-layout 的 AppFrame 声明；alpha 要求注册进入前该槽已由
  // 父条目 children 表声明，故用 inject 等其声明 live 后再注册。
  controller.add(ctx.slots.inject(SHELL_OVERLAY_SLOT, () =>
    ctx.slots.register(
      {
        name: SHELL_OVERLAY_SLOT,
        id: DIALOG_ID,
        registrant: WORKTREE_PLUGIN_NAME,
        inject: (): Pick<WorktreeDialogProps, 'sessionsRuntime' | 'workspacesRuntime'> => ({
          // adapter.sessions / adapter.workspaces 是适配后的宿主服务面
          // （SessionStore / IWorkspaces），投影到 WorktreeDialogProps 所需的轻量运行时读写面。
          workspacesRuntime: adapter.workspaces as unknown as WorktreeDialogProps['workspacesRuntime'],
          sessionsRuntime: adapter.sessions as unknown as WorktreeDialogProps['sessionsRuntime'],
        }),
      },
      // WorktreeDialog 需要官方 session UI 提供的标准 prop `useSessions`；该包不在本
      // workspace 的 d.ts 集合里，故注册面按已注册条目形状断言。
      WorktreeDialog as never,
    )))
})
