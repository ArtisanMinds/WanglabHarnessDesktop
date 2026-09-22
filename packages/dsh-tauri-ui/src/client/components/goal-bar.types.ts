import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export interface GoalBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  glyph?: ReactNode
  label?: ReactNode
  objective?: ReactNode
  error?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export interface GoalBarActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  iconOnly?: boolean
  children?: ReactNode
}
