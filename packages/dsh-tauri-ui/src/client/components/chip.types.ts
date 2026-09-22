import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ChipVariant = 'seat' | 'composerTrigger' | 'selector'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant: ChipVariant
  icon?: ReactNode
  chevron?: ReactNode
  open?: boolean
  children?: ReactNode
}
