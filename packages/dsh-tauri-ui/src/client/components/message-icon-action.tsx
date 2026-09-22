import type { ReactElement } from 'react'
import type { MessageIconActionProps } from './message-icon-action.types'
import { compact } from 'dsh-tauri/client'
import { MESSAGE_ICON_ACTION_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import messageIconActionStyle from './message-icon-action.cssr'

export function MessageIconAction({ icon, className, children, ...rest }: MessageIconActionProps): ReactElement {
  useMountStyle(messageIconActionStyle, MESSAGE_ICON_ACTION_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-message-icon-action', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
