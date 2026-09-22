import type { ReactElement } from 'react'
import type { ModelIconButtonProps } from './model-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { MODEL_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import modelIconButtonStyle from './model-icon-button.cssr'

export function ModelIconButton({ icon, className, children, ...rest }: ModelIconButtonProps): ReactElement {
  useMountStyle(modelIconButtonStyle, MODEL_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-model-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
