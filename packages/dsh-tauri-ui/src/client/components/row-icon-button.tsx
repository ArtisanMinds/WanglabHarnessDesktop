import type { ReactElement } from 'react'
import type { RowIconButtonProps } from './row-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { ROW_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import rowIconButtonStyle from './row-icon-button.cssr'

export function RowIconButton({ icon, className, children, ...rest }: RowIconButtonProps): ReactElement {
  useMountStyle(rowIconButtonStyle, ROW_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-row-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
