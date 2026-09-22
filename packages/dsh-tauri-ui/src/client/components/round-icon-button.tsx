import type { ReactElement } from 'react'
import type { RoundIconButtonProps } from './round-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { ROUND_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import roundIconButtonStyle from './round-icon-button.cssr'

export function RoundIconButton({ icon, className, children, ...rest }: RoundIconButtonProps): ReactElement {
  useMountStyle(roundIconButtonStyle, ROUND_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-round-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
