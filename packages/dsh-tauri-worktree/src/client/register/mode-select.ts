/**
 * register/mode-select.ts — 「标准模式」右侧工作模式选择器的 slot 注册。
 *
 * 注册进 conversation.input.dock；inject 句柄由 `defineRegister` 的控制器统一 dispose。
 * 官方服务面（会话 / 工作区）一律经第三个参数 `adapter` 取用：旧核的 `compat(ctx)`
 * 已废弃，跨版本漂移由适配层承担。
 */

import type { ClientContext } from 'dsh-tauri/client'
import type { ModeSelectProps, SessionsRuntime, WorkspacesRuntime } from '../types'
import { defineRegister } from 'dsh-tauri/client'
import { WorktreeModeSelect } from '../components/mode-select'
import { INPUT_DOCK_SLOT, MODE_SELECT_ID, MODE_SELECT_ORDER } from '../constants'
import { NS } from '../locales'

/** 注入除标准槽位 props（useInput/inputActions）外的自定义注入面。 */
type ModeSelectInjected = Omit<ModeSelectProps, 'useInput' | 'inputActions'>

/** 使用 input.dock 的 session 生命周期，并把控件 portal 到标准模式右侧。 */
export const modeSelectFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  controller.add(ctx.slots.inject(INPUT_DOCK_SLOT as never, () =>
    ctx.slots.register(
      {
        name: INPUT_DOCK_SLOT,
        id: MODE_SELECT_ID,
        order: MODE_SELECT_ORDER,
        locale: NS,
        inject: (sessionId: string | undefined): ModeSelectInjected | undefined => sessionId === undefined
          ? undefined
          : {
              sessionId,
              sessionsRuntime: adapter.sessions as unknown as SessionsRuntime,
              // 切换工作树成功后归档源会话（workspaces 服务面提供 archiveSession）。
              workspacesRuntime: adapter.workspaces as unknown as WorkspacesRuntime,
            },
      } as never,
      WorktreeModeSelect,
    )))
})
