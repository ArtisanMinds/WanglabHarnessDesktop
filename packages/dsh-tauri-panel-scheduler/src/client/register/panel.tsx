import type { ClientContext, PanelHandle } from 'dsh-tauri/client'
import type { Translate } from '../locales/index.types'
import { PanelPage } from 'dsh-tauri-ui/client'
import { definePanel, defineRegister } from 'dsh-tauri/client'
import { SchedulerNavIcon } from '../components/scheduler-nav-icon'
import { SchedulerPanel } from '../components/scheduler-panel'
import { PANEL_ACTION_ORDER, PANEL_ID, REFRESH_INTERVAL_MS } from '../constants'
import { locale } from '../locales'
import { loadScheduler } from '../service/scheduler'
import { store } from '../store'

export const panelFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  const t: Translate = locale.text
  const holder: { current?: PanelHandle } = {}

  // 侧边栏未读角标在面板关闭时也要跟上新运行，所以拉取轮询放在注册层；
  // 面板自己只负责首屏（含对话框选项）与回焦刷新。
  void loadScheduler(false)
  const timer = setInterval(() => {
    void loadScheduler(false)
  }, REFRESH_INTERVAL_MS)
  controller.add(() => clearInterval(timer))

  holder.current = definePanel(ctx, {
    id: PANEL_ID,
    order: PANEL_ACTION_ORDER,
    locale: locale.NS,
    label: () => locale.text('scheduler'),
    icon: props => <SchedulerNavIcon size={props.size} />,
    render: () => (
      <PanelPage>
        <SchedulerPanel
          t={t}
          onViaChat={() => {
            store.prefill.set(locale.text('chatPrompt'))
            holder.current?.close()
          }}
          onOpenSession={(sessionId) => {
            if (adapter.openSession(sessionId).status === 'unavailable')
              return false
            holder.current?.close()
            return true
          }}
        />
      </PanelPage>
    ),
  })
  controller.add(holder.current.dispose)
})
