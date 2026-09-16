import { PLUGIN_ID } from '../../shared/constants'

export { PLUGIN_ID } from '../../shared/constants'

export const PANEL_ID = PLUGIN_ID
export const PANEL_ACTION_ORDER = 30

export const CONVERSATION_INPUT_LEFT_SLOT = 'conversation.input.left'
export const INPUT_PREFILL_ID = `${PLUGIN_ID}.prefill`
export const INPUT_PREFILL_ORDER = 40
export const INPUT_PREFILL_PRIORITY = 0

export const STYLE_ID = `${PLUGIN_ID}-styles`
export const SCHEDULER_PANEL_STYLE_ID = `${PLUGIN_ID}-panel-styles`
export const TASK_CARD_STYLE_ID = `${PLUGIN_ID}-task-card-styles`
export const RUNS_TAB_STYLE_ID = `${PLUGIN_ID}-runs-tab-styles`
export const RECOMMENDATIONS_STYLE_ID = `${PLUGIN_ID}-recommendations-styles`
export const MODEL_PICKER_STYLE_ID = `${PLUGIN_ID}-model-picker-styles`
export const MENU_STYLE_ID = `${PLUGIN_ID}-menu-styles`
export const TASK_CREATE_DIALOG_STYLE_ID = `${PLUGIN_ID}-task-create-dialog-styles`
export const SESSION_ICON_STYLE_ID = `${PLUGIN_ID}-session-clock-icon`

export const SESSION_ICON_ATTRIBUTE = 'data-dsh-scheduler-icon'
export const SIDEBAR_SELECTOR = '[data-slot="sidebar"]'

export const REFRESH_INTERVAL_MS = 5_000

export const LOCALE_EFFECT = `${PLUGIN_ID}: locale`
export const STYLES_EFFECT = `${PLUGIN_ID}: styles`
export const HYDRATE_EFFECT = `${PLUGIN_ID}: hydrate`
export const PANEL_EFFECT = `${PLUGIN_ID}: panel`
export const PREFILL_EFFECT = `${PLUGIN_ID}: prefill`
export const SESSION_ICONS_EFFECT = `${PLUGIN_ID}: session clock icons`
