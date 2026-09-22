import type { ReactNode } from 'react'

export interface CheckboxProps {
  'checked': boolean
  'disabled'?: boolean
  'onChange': (next: boolean) => void
  'children'?: ReactNode
  'aria-label'?: string
  'title'?: string
}
