import { WORKTREE_API_PREFIX, PLUGIN_ID } from './shared/constants'

export const name = PLUGIN_ID

export const inject = ['tools', 'systemPrompt', 'webServer', 'sessions', 'workspaceRegistry', 'agents', 'connection']

export const API_PREFIX = WORKTREE_API_PREFIX

export { apply } from './host/apply'
