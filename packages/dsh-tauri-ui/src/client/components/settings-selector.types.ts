import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface SettingsSelectorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  chevron?: ReactNode
}
