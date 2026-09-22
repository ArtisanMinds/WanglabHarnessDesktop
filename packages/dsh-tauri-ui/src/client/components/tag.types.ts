import type { HTMLAttributes, ReactNode } from 'react'

export type TagVariant = 'default' | 'version' | 'status'

export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant?: TagVariant
  tone?: TagTone
  children?: ReactNode
}
