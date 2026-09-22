import type { ReactElement } from 'react'
import type { AddButtonProps } from './add-button.types'
import { compact } from 'dsh-tauri/client'
import { ADD_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import addButtonStyle from './add-button.cssr'

export function AddButton({ icon, className, children, ...rest }: AddButtonProps): ReactElement {
  useMountStyle(addButtonStyle, ADD_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-add-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
