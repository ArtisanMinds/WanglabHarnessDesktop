import { RIGHTCLICK_API_PREFIX, PLUGIN_ID } from './shared/constants'

export const name = PLUGIN_ID

export const inject = ['webServer', 'connection']

export const API_PREFIX = RIGHTCLICK_API_PREFIX

export { apply } from './host/apply'
