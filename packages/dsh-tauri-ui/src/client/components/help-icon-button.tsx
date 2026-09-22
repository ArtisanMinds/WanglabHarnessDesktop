import type { ReactElement } from 'react'
import type { HelpIconButtonProps } from './help-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { HELP_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import helpIconButtonStyle from './help-icon-button.cssr'

export function HelpIconButton({ icon, className, children, ...rest }: HelpIconButtonProps): ReactElement {
  useMountStyle(helpIconButtonStyle, HELP_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-help-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
