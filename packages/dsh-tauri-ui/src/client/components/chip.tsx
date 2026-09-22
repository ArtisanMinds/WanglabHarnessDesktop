import type { ReactElement } from 'react'
import type { ChipProps } from './chip.types'
import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import chipStyle from './chip.cssr'

const CHIP_STYLE_ID = 'dsh-tauri-ui-chip-styles'

export function Chip({ variant, icon, chevron, open, className, children, ...rest }: ChipProps): ReactElement {
  useMountStyle(chipStyle, CHIP_STYLE_ID)
  return (
    <button
      type="button"
      className={compact(['dshp-chip', `dshp-chip--${variant}`, className]).join(' ')}
      {...rest}
    >
      {icon}
      {children}
      {chevron === undefined
        ? null
        : <span className="dshp-chip__chevron" data-open={open === true ? 'true' : undefined}>{chevron}</span>}
    </button>
  )
}
