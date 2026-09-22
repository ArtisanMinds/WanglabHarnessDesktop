import type { ReactElement } from 'react'
import type { ChipProps } from './chip.types'
import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import chipStyle from './chip.cssr'

const CHIP_STYLE_ID = 'dsh-tauri-ui-chip-styles'

export function Chip({ variant, icon, badge, chevron, open, className, children, ...rest }: ChipProps): ReactElement {
  useMountStyle(chipStyle, CHIP_STYLE_ID)
  // 官方 PermissionRow.selector 不包 icon/label/badge，其余两个 variant 按 PermissionSelect/AgentPresetSeat 包裹。
  const wraps = variant !== 'selector'
  return (
    <button
      type="button"
      className={compact(['dshp-chip', `dshp-chip--${variant}`, className]).join(' ')}
      {...rest}
    >
      {wraps && icon != null ? <span className="dshp-chip__icon" aria-hidden>{icon}</span> : icon}
      {wraps && children != null ? <span className="dshp-chip__label">{children}</span> : children}
      {wraps && badge != null ? <span className="dshp-chip__badge" aria-hidden>{badge}</span> : badge}
      {chevron === undefined
        ? null
        : <span className="dshp-chip__chevron" aria-hidden data-open={open === true ? 'true' : undefined}>{chevron}</span>}
    </button>
  )
}
