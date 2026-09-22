import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant
  = | 'primary'
    | 'ghost'
    | 'outline'
    | 'toolbar'
    | 'elevated'
    | 'add'
    | 'danger'

export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  children?: ReactNode
}
