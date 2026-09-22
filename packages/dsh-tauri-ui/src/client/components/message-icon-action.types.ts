import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface MessageIconActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
}
