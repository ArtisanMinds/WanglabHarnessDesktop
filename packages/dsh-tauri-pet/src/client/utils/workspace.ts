import type { ClientAdapter } from 'dsh-tauri/client'
import type { WorkspaceItem } from '../types'

/** `sessions.list` 投影的读取面（官方投影形状随版本漂移，只取用到的字段）。 */
interface SessionsSnapshot {
  current?: string
  ids?: readonly string[]
}

/** `workspaces.list` 投影的读取面。 */
interface WorkspacesSnapshot {
  items?: WorkspaceItem[]
  recentWorkspaceId?: string
}

function workspaceId(item: WorkspaceItem): string | undefined {
  return item.workspaceId ?? item.id
}

/**
 * Follow the standard new-session target order: current, recent, then first workspace.
 *
 * 列表投影经适配层取（`adapter.sessions.list` / `adapter.workspaces.list`），
 * 快照结构按需收窄——服务或字段缺席时按空处理，不猜核心版本。
 */
export function chooseWorkspace(adapter: ClientAdapter): string | undefined {
  const sessions = (adapter.sessions.list?.getSnapshot() ?? {}) as SessionsSnapshot
  const workspaces = (adapter.workspaces.list?.getSnapshot() ?? {}) as WorkspacesSnapshot
  const items = workspaces.items ?? []
  const current = sessions.current
  const currentItem = current === undefined
    ? undefined
    : items.find(item => item.sessionIds?.includes(current))
  const currentId = currentItem === undefined ? undefined : workspaceId(currentItem)
  if (currentId !== undefined)
    return currentId
  if (
    workspaces.recentWorkspaceId !== undefined
    && items.some(item => workspaceId(item) === workspaces.recentWorkspaceId)
  ) {
    return workspaces.recentWorkspaceId
  }
  return items.map(workspaceId).find((id): id is string => id !== undefined)
}
