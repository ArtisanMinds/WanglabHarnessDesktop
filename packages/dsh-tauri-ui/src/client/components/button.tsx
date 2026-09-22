import type { ReactElement } from 'react'
import type { ButtonProps, ButtonSize } from './button.types'
import { Button as PrimitiveButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import buttonStyle from './button.cssr'

const BUTTON_STYLE_ID = 'dsh-tauri-ui-button-styles'

function isLocalVariant(variant: ButtonProps['variant']): variant is 'elevated' | 'add' | 'addGhost' | 'danger' {
  return variant === 'elevated' || variant === 'add' || variant === 'addGhost' || variant === 'danger'
}

// elevated / add / addGhost 是上游固定几何，size 对其无效；danger 沿用官方 outline 的 md / sm 两档。
function LocalButton({
  variant,
  size,
  icon,
  className,
  children,
  ...rest
}: ButtonProps & { variant: 'elevated' | 'add' | 'addGhost' | 'danger', size: ButtonSize }): ReactElement {
  useMountStyle(buttonStyle, BUTTON_STYLE_ID)
  return (
    <button
      type="button"
      className={compact(['dshp-button', `dshp-button--${variant}`, `dshp-button--${size}`, className]).join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }: ButtonProps): ReactElement {
  if (isLocalVariant(variant))
    return <LocalButton variant={variant} size={size} icon={icon} className={className} {...rest}>{children}</LocalButton>
  return <PrimitiveButton variant={variant} size={size} icon={icon} className={className} {...rest}>{children}</PrimitiveButton>
}
