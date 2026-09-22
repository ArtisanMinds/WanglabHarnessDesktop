import type { ReactElement } from 'react'
import type { SeatChipProps } from './seat-chip.types'
import { compact } from 'dsh-tauri/client'
import { SEAT_CHIP_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import seatChipStyle from './seat-chip.cssr'

export function SeatChip({ icon, chevron, className, children, ...rest }: SeatChipProps): ReactElement {
  useMountStyle(seatChipStyle, SEAT_CHIP_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-seat-chip', className]).join(' ')} {...rest}>
      {icon}
      {children}
      {chevron === undefined ? null : <span className="dshp-seat-chip__chevron">{chevron}</span>}
    </button>
  )
}
