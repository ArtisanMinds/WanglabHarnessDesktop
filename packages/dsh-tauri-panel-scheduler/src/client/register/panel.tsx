import type { ClientContext, PanelHandle } from 'dsh-tauri/client'
import type { Translate } from '../locales/index.types'
import { Calendar, Icon, PanelPage } from 'dsh-tauri-ui/client'
import { definePanel, defineRegister } from 'dsh-tauri/client'
import { SchedulerPanel } from '../components/scheduler-panel'
import { PANEL_ACTION_ORDER, PANEL_ID } from '../constants'
import { locale } from '../locales'
import { store } from '../store'

export const panelFeature = defineRegister<ClientContext>((controller, ctx) => {
  const t: Translate = locale.text
  const holder: { current?: PanelHandle } = {}

  holder.current = definePanel(ctx, {
    id: PANEL_ID,
    order: PANEL_ACTION_ORDER,
    locale: locale.NS,
    label: () => locale.text('scheduler'),
    icon: props => <Icon as={Calendar} size={props.size} />,
    render: () => (
      <PanelPage>
        <SchedulerPanel
          t={t}
          onViaChat={() => {
            store.prefill.set(locale.text('chatPrompt'))
            holder.current?.close()
          }}
          onOpenSession={(sessionId) => {
            const known = ctx.sessions.list.getSnapshot().ids.find(id => id === sessionId)
            if (known === undefined)
              return false
            ctx.sessions.open(known)
            holder.current?.close()
            return true
          }}
        />
      </PanelPage>
    ),
  })
  controller.add(holder.current.dispose)
})
