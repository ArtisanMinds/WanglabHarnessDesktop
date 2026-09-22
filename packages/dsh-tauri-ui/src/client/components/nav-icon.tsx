import type { ReactElement } from 'react'
import type { IconComponent } from './icon'
import { get } from 'dsh-tauri/client'
import { SETTINGS_NAV_ICON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import { Icon } from './icon'
import { Database, Gear, Person, Puzzle } from './icons'
import settingsNavIconStyle from './nav-icon.cssr'

const NAV_ICONS: Record<string, IconComponent> = {
  'models': Database,
  'agent-presets': Person,
  'plugins': Puzzle,
}

export function SettingsNavIcon({ id }: { id: string }): ReactElement {
  useMountStyle(settingsNavIconStyle, SETTINGS_NAV_ICON_STYLE_ID)
  const NavIcon = get(NAV_ICONS, id, Gear)
  return <Icon as={NavIcon} size={16} className="dshp-settings-nav-icon" />
}
