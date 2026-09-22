import type { ReactElement } from 'react'
import type { VersionTagProps } from './version-tag.types'
import { compact } from 'dsh-tauri/client'
import { VERSION_TAG_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import versionTagStyle from './version-tag.cssr'

export function VersionTag({ tone = 'neutral', className, children, ...rest }: VersionTagProps): ReactElement {
  useMountStyle(versionTagStyle, VERSION_TAG_STYLE_ID)
  return (
    <span className={compact(['dshp-version-tag', className]).join(' ')} data-tone={tone} {...rest}>
      {children}
    </span>
  )
}
