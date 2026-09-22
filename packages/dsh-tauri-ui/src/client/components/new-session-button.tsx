import type { ReactElement } from 'react'
import type { NewSessionButtonProps } from './new-session-button.types'
import { compact } from 'dsh-tauri/client'
import { NEW_SESSION_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import newSessionButtonStyle from './new-session-button.cssr'

export function NewSessionButton({ icon, className, children, ...rest }: NewSessionButtonProps): ReactElement {
  useMountStyle(newSessionButtonStyle, NEW_SESSION_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-new-session-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
