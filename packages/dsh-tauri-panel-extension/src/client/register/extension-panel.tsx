/**
 * register/extension-panel.tsx — 扩展面板的 slot 注册 feature。
 *
 * 走 **官方全局面板协议**（0.1.5-rc.1 起）：`panel.protocol.registerPanel` 由宿主
 * 代注册 `sidebar.panellist`（入口行）+ `main`（内容），选中态由官方
 * `ctx.layout.selectPanel` 统一派发。旧核心宿主内部回退到私有槽 + 会话区替换。
 * 完整契约见 dsh-tauri-panel/PROTOCOL.md。
 *
 * 注册逻辑与组件分离：这里只负责「等宿主协议就绪 → 一次性注册」，含重试等待。
 * 跨核心版本的会话 / 工作区服务布局差异由 `adapter`（`defineRegister` 第三个参数）
 * 承担，本文件不再自行 `compat(ctx)`。UI 在 components/extension-panel.tsx。
 */

import type { ReactElement } from 'react'
import type { ExtensionClientContext, PanelProtocol, Translate } from '../types'
import { Icon, Puzzle } from 'dsh-tauri-ui/client'
import { defineRegister } from 'dsh-tauri/client'
import { ExtensionPanel } from '../components/extension-panel'
import {
  LOCALE_NAMESPACE,
  PANEL_ACTION_ORDER,
  PANEL_ID,
  PANEL_PROTOCOL_NAME,
  PANEL_SLOT_NAME,
  PROTOCOL_RETRY_MS,
} from '../constants'
import { store } from '../store'
import { chooseWorkspace, sessionSnapshotOf, workspaceSnapshotOf } from '../utils/workspace'

export const extensionPanelFeature = defineRegister<ExtensionClientContext>((controller, ctx, adapter) => {
  const t = ctx.locale.bind(LOCALE_NAMESPACE) as Translate
  controller.add(ctx.slots.inject(PANEL_SLOT_NAME as never, () => {
    let registration: (() => void) | undefined
    let cancelRetry: (() => void) | undefined

    const attemptRegistration = (): void => {
      if (registration)
        return
      const protocol = ctx.reflect.get(PANEL_PROTOCOL_NAME) as PanelProtocol | undefined
      if (typeof protocol?.registerPanel !== 'function')
        return
      const createSkill = async (): Promise<void> => {
        const id = chooseWorkspace(
          sessionSnapshotOf(adapter.sessions.list?.getSnapshot()),
          workspaceSnapshotOf(adapter.workspaces.list?.getSnapshot()),
        )
        if (id === undefined)
          throw new Error(t('workspaceUnavailable'))
        const sessionId = await adapter.workspaces.connectWorkspace?.(id)
        if (typeof sessionId !== 'string' || sessionId === '')
          throw new Error(t('workspaceUnavailable'))
        store.prefill.add(sessionId)
        protocol.closePanelContent?.()
        adapter.sessions.open?.(sessionId)
      }
      const Content = (): ReactElement => (
        <ExtensionPanel
          t={t}
          createSkill={createSkill}
        />
      )
      registration = protocol.registerPanel({
        id: PANEL_ID,
        order: PANEL_ACTION_ORDER,
        locale: LOCALE_NAMESPACE,
        label: () => t('extension'),
        icon: <Icon as={Puzzle} />,
        render: Content,
      })
      cancelRetry?.()
      cancelRetry = undefined
    }

    attemptRegistration()
    if (!registration)
      cancelRetry = controller.interval(attemptRegistration, PROTOCOL_RETRY_MS)
    return () => {
      cancelRetry?.()
      registration?.()
    }
  }))
})
