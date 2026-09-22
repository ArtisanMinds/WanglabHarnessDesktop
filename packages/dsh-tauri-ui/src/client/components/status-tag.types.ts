import type { HTMLAttributes } from 'react'

export type StatusTagTone = 'outline' | 'info' | 'danger'

export interface StatusTagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTagTone
}
