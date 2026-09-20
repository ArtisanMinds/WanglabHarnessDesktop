import { PLUGIN_ID } from '../../shared/constants'

export const SETTINGS_REGISTRANT = PLUGIN_ID
export const SETTINGS_SHELL_SEAT_ID = PLUGIN_ID

export const SETTINGS_SHELL_OVERLAY_SLOT = 'shell.overlay'
export const SETTINGS_SIDEBAR_SLOT = 'sidebar.settings'
export const SETTINGS_SECTION_SLOT = 'settings.section'
export const SETTINGS_TRIGGER_SLOT = 'settings.trigger'
export const SETTINGS_ONBOARDING_SLOT = 'settings.onboarding'

export const SETTINGS_SIDEBAR_ID = 'dsh-tauri-ui-settings'
export const SETTINGS_SIDEBAR_CLASS = 'dshp-settings-sidebar'
export const SETTINGS_STYLE_ID = 'dsh-tauri-ui-settings-sidebar-styles'
export const SETTINGS_TRIGGER_STYLE_ID = 'dsh-tauri-ui-settings-trigger-styles'
export const SETTINGS_NAV_ICON_STYLE_ID = 'dsh-tauri-ui-settings-nav-icon-styles'
export const MENU_SELECT_STYLE_ID = 'dsh-tauri-ui-menu-select-styles'
export const TURN_NAVIGATION_STYLE_ID = 'dsh-tauri-ui-turn-navigation-styles'
export const GLOBAL_STYLE_ID = 'dsh-tauri-ui-global-styles'

/** dsh-im 客户端插件经 `ctx.provide` 发布的反射服务名（4.22.0 起）。 */
export const DSH_IM_CLIENT_SERVICE = 'dshImClient'

export const STYLES_EFFECT = `${PLUGIN_ID}: styles`
export const LOCALE_EFFECT = `${PLUGIN_ID}: locale`
export const SEAT_EFFECT = `${PLUGIN_ID}: shell.overlay seat`
export const SECTIONS_EFFECT = `${PLUGIN_ID}: settings sections projection`
export const SETTINGS_EFFECT = `${PLUGIN_ID}: settings panel`
export const OBSTRUCTIONS_EFFECT = `${PLUGIN_ID}: settings obstructions`
export const IM_PANEL_EFFECT = `${PLUGIN_ID}: im panel`

export const TURN_NAVIGATION_LABEL_ZH = '轮次导航'
export const TURN_NAVIGATION_LABEL_EN = 'Turn navigation'
export const TURN_NAVIGATION_SELECTOR = `:is(nav[aria-label="${TURN_NAVIGATION_LABEL_ZH}"], nav[aria-label="${TURN_NAVIGATION_LABEL_EN}"])`
export const TURN_NAVIGATION_SLOT_SELECTOR = `div:has(> ${TURN_NAVIGATION_SELECTOR})`

export const SETTINGS_TRIGGER_PRIORITY = -1

export const SETTINGS_UNDERLAY_SLOT_KEYS = ['sidebar', 'main', 'rightbar'] as const
export const SETTINGS_EXTERNAL_OVERLAY_SELECTORS = ['[data-dsh-better-sidebar]', '[data-dsh-panel]'] as const
export const SIDEBAR_WIDTH_PROPERTY = '--dsh-sidebar-width'

export const RAIL_WIDTH_MIN = 264
export const RAIL_WIDTH_MAX = 420
export const RAIL_WIDTH_DEFAULT = 280
