import type { ClientContext, PanelHandle } from 'dsh-tauri/client'
import type { MarketFace } from '../service/market.types'
import { Icon, PanelPage, Puzzle } from 'dsh-tauri-ui/client'
import { definePanel, defineRegister } from 'dsh-tauri/client'
import { ExtensionPanel } from '../components/extension-panel'
import { MARKET_SERVICE_NAME, PANEL_ACTION_ORDER, PANEL_ID } from '../constants'
import { locale } from '../locales'
import { readMarket } from '../service/market'
import { store } from '../store'
import { chooseWorkspace, sessionSnapshotOf, workspaceSnapshotOf } from './extension-panel.utils'

export const extensionPanelFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  let panel: PanelHandle | undefined
  let market: MarketFace | undefined

  // 面板收进本插槽后，市场自带的设置页入口就是重复入口，撤下它；
  // 服务由另一个客户端插件发布，apply 顺序不保证，所以用 inject 等它到位。
  ctx.inject([MARKET_SERVICE_NAME], () => {
    market = readMarket(ctx)
    market?.setSettingsVisible(false)
  })
  controller.add(() => market?.setSettingsVisible(true))

  const createSkill = async (): Promise<void> => {
    const id = chooseWorkspace(
      sessionSnapshotOf(adapter.sessions.list?.getSnapshot()),
      workspaceSnapshotOf(adapter.workspaces.list?.getSnapshot()),
    )
    if (id === undefined)
      throw new Error(locale.text('workspaceUnavailable'))
    const sessionId = await adapter.workspaces.connectWorkspace?.(id)
    if (typeof sessionId !== 'string' || sessionId === '')
      throw new Error(locale.text('workspaceUnavailable'))
    store.prefill.add(sessionId)
    panel?.close()
    adapter.sessions.open?.(sessionId)
  }

  panel = definePanel(ctx, {
    id: PANEL_ID,
    order: PANEL_ACTION_ORDER,
    locale: locale.NS,
    label: () => locale.text('extension'),
    icon: props => <Icon as={Puzzle} size={props.size} />,
    render: () => (
      <PanelPage>
        <ExtensionPanel createSkill={createSkill} market={readMarket(ctx)} />
      </PanelPage>
    ),
  })
  controller.add(panel.dispose)
})
