import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface SeatChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  chevron?: ReactNode
}
