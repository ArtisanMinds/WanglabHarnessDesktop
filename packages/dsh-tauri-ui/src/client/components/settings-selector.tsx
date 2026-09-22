import type { ReactElement } from 'react'
import type { SettingsSelectorProps } from './settings-selector.types'
import { compact } from 'dsh-tauri/client'
import { SETTINGS_SELECTOR_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import settingsSelectorStyle from './settings-selector.cssr'

export function SettingsSelector({ icon, chevron, className, children, ...rest }: SettingsSelectorProps): ReactElement {
  useMountStyle(settingsSelectorStyle, SETTINGS_SELECTOR_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-settings-selector', className]).join(' ')} {...rest}>
      {icon}
      {children}
      {chevron === undefined ? null : <span className="dshp-settings-selector__chevron">{chevron}</span>}
    </button>
  )
}
