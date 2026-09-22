import type { ReactElement } from 'react'
import type { TagProps } from './tag.types'
import { Tag as PrimitiveTag } from '@deepseek-ai/dsh-client-ui-primitives'
import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import tagStyle from './tag.cssr'

const TAG_STYLE_ID = 'dsh-tauri-ui-tag-styles'

function LocalTag({ variant, tone = 'outline', className, children, ...rest }: TagProps & { variant: 'version' | 'status' }): ReactElement {
  useMountStyle(tagStyle, TAG_STYLE_ID)
  return (
    <span
      className={compact(['dshp-tag', `dshp-tag--${variant}`, className]).join(' ')}
      data-tone={tone}
      {...rest}
    >
      {children}
    </span>
  )
}

export function Tag({ variant = 'default', tone = 'outline', className, children, ...rest }: TagProps): ReactElement {
  if (variant === 'default')
    return <PrimitiveTag tone={tone} className={className}>{children}</PrimitiveTag>
  return <LocalTag variant={variant} tone={tone} className={className} {...rest}>{children}</LocalTag>
}
