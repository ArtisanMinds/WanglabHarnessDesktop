import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ComposerTriggerChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  chevron?: ReactNode
  open?: boolean
}
