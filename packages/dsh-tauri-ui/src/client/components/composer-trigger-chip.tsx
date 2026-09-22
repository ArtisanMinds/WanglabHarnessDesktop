import type { ReactElement } from 'react'
import type { ComposerTriggerChipProps } from './composer-trigger-chip.types'
import { compact } from 'dsh-tauri/client'
import { COMPOSER_TRIGGER_CHIP_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import composerTriggerChipStyle from './composer-trigger-chip.cssr'

export function ComposerTriggerChip({ icon, chevron, open, className, children, ...rest }: ComposerTriggerChipProps): ReactElement {
  useMountStyle(composerTriggerChipStyle, COMPOSER_TRIGGER_CHIP_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-composer-trigger-chip', className]).join(' ')} {...rest}>
      {icon}
      {children}
      {chevron === undefined
        ? null
        : <span className="dshp-composer-trigger-chip__chevron" data-open={open === true ? 'true' : undefined}>{chevron}</span>}
    </button>
  )
}
