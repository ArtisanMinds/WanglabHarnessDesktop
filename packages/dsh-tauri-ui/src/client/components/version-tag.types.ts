import type { HTMLAttributes } from 'react'

export type VersionTagTone = 'outline' | 'neutral'

export interface VersionTagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: VersionTagTone
}
