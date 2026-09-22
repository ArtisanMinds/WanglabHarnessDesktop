import type { ReactElement } from 'react'
import type { ToolbarIconButtonProps } from './toolbar-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { TOOLBAR_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import toolbarIconButtonStyle from './toolbar-icon-button.cssr'

export function ToolbarIconButton({ icon, className, children, ...rest }: ToolbarIconButtonProps): ReactElement {
  useMountStyle(toolbarIconButtonStyle, TOOLBAR_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-toolbar-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
