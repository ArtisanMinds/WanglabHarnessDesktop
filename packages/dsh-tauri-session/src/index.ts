import { SESSION_API_PREFIX, PLUGIN_ID } from './shared/constants'

export const name = PLUGIN_ID

export const inject = ['webServer', 'sessions', 'workspaceRegistry', 'connection']

export const API_PREFIX = SESSION_API_PREFIX

export { apply } from './host/apply'
export { archiveHooks } from './host/events'
export type { ArchiveLifecycleHooks } from './host/events'
