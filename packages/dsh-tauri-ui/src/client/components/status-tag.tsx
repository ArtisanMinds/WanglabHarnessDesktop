import type { ReactElement } from 'react'
import type { StatusTagProps } from './status-tag.types'
import { compact } from 'dsh-tauri/client'
import { STATUS_TAG_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import statusTagStyle from './status-tag.cssr'

export function StatusTag({ tone = 'outline', className, children, ...rest }: StatusTagProps): ReactElement {
  useMountStyle(statusTagStyle, STATUS_TAG_STYLE_ID)
  return (
    <span className={compact(['dshp-status-tag', className]).join(' ')} data-tone={tone} {...rest}>
      {children}
    </span>
  )
}
