import { PLUGIN_ID } from '../../shared/constants'

export const SCHEDULER_TASKS_KEY = 'tasks'
export const SCHEDULER_RUNS_KEY = 'runs'
export const SCHEDULER_RUNS_HISTORY_LIMIT = 200
export const SCHEDULER_TICK_MS = 1_000
export const SCHEDULER_MAX_CONCURRENT_RUNS = 4
export const SCHEDULER_PROMPT_MAX_LENGTH = 64_000
export const SCHEDULER_NAME_MAX_LENGTH = 120
export const SCHEDULER_RUN_TIMEOUT_MS = 30 * 60 * 1000
export const SCHEDULER_CANCEL_TIMEOUT_MS = 10_000
export const SCHEDULER_AGENT_PRESET = 'standard'
export const SCHEDULER_UNGROUPED_DIRECTORY = 'automations'
export const SCHEDULER_INTERRUPTED_ERROR = 'host_interrupted'

export const SCHEDULER_ROUTES_EFFECT = `${PLUGIN_ID}: routes`
export const SCHEDULER_RECOVER_EFFECT = `${PLUGIN_ID}: recover interrupted runs`
export const SCHEDULER_TICK_EFFECT = `${PLUGIN_ID}: tick`
export const SCHEDULER_RUNTIME_EFFECT = `${PLUGIN_ID}: host runtime`
