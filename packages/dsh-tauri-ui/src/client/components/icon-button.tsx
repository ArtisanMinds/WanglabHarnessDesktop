import type { ReactElement } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import iconButtonStyle from './icon-button.cssr'

export type IconButtonVariant = 'search' | 'toolbar' | 'model' | 'round' | 'row' | 'help' | 'action'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant: IconButtonVariant
  icon?: ReactNode
  children?: ReactNode
}

const ICON_BUTTON_STYLE_ID = 'dsh-tauri-ui-icon-button-styles'

export function IconButton({ variant, icon, className, children, ...rest }: IconButtonProps): ReactElement {
  useMountStyle(iconButtonStyle, ICON_BUTTON_STYLE_ID)
  return (
    <button
      type="button"
      className={compact(['dshp-icon-button', `dshp-icon-button--${variant}`, className]).join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
