import type { ReactElement, ReactNode } from 'react'
import { useMountStyle } from '../hooks/use-mount-style'
import imPanelStyle from './im-panel.cssr'

const IM_PANEL_STYLE_ID = 'dsh-tauri-ui-im-panel-styles'

export function ImPanel({ render }: { render: () => ReactNode }): ReactElement {
  useMountStyle(imPanelStyle, IM_PANEL_STYLE_ID)
  return <div className="dshp-im-panel">{render()}</div>
}
