import type { ReactElement } from 'react'
import type { DangerOutlineButtonProps } from './danger-outline-button.types'
import { compact } from 'dsh-tauri/client'
import { DANGER_OUTLINE_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import dangerOutlineButtonStyle from './danger-outline-button.cssr'

export function DangerOutlineButton({ icon, className, children, ...rest }: DangerOutlineButtonProps): ReactElement {
  useMountStyle(dangerOutlineButtonStyle, DANGER_OUTLINE_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-danger-outline-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
