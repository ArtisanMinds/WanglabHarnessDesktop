import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ToolbarIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
}
