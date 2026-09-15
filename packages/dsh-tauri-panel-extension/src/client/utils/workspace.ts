/**
 * utils/workspace.ts — 工作区选择与运行时快照归一化。
 *
 * 适配层的 `sessions.list` / `workspaces.list` 投影读出来是 `unknown`（官方服务
 * 布局逐版本漂移），这里统一归一化成组件可用的稳定快照形状。
 */

import type { SessionListSnapshot, WorkspaceListItem, WorkspaceListSnapshot } from '../types'

function workspaceId(item: WorkspaceListItem): string | undefined {
  return item.workspaceId ?? item.id
}

/** 归一化会话列表投影：只有字符串 current 与字符串 id 数组算有效。 */
export function sessionSnapshotOf(value: unknown): SessionListSnapshot {
  if (typeof value !== 'object' || value === null)
    return { ids: [] }
  const snapshot = value as Record<string, unknown>
  return {
    ...(typeof snapshot.current === 'string' ? { current: snapshot.current } : {}),
    ids: Array.isArray(snapshot.ids) ? snapshot.ids.filter((id): id is string => typeof id === 'string') : [],
  }
}

/** 归一化工作区列表投影：条目按 id/sessionIds 逐字段取值。 */
export function workspaceSnapshotOf(value: unknown): WorkspaceListSnapshot {
  if (typeof value !== 'object' || value === null)
    return {}
  const snapshot = value as Record<string, unknown>
  const items = Array.isArray(snapshot.items)
    ? snapshot.items.filter((item: unknown): item is WorkspaceListItem => typeof item === 'object' && item !== null)
    : undefined
  return {
    ...(items !== undefined ? { items } : {}),
    ...(typeof snapshot.recentWorkspaceId === 'string' ? { recentWorkspaceId: snapshot.recentWorkspaceId } : {}),
  }
}

/** Follow DSH's New Session target order: current session, recent workspace, first workspace. */
export function chooseWorkspace(
  sessions: SessionListSnapshot,
  workspaces: WorkspaceListSnapshot,
): string | undefined {
  const items = workspaces.items ?? []
  const current = sessions.current
  const currentItem = current === undefined
    ? undefined
    : items.find(item => item.sessionIds?.includes(current))
  const currentId = currentItem === undefined ? undefined : workspaceId(currentItem)
  if (currentId !== undefined)
    return currentId
  if (workspaces.recentWorkspaceId !== undefined && items.some(item => workspaceId(item) === workspaces.recentWorkspaceId))
    return workspaces.recentWorkspaceId
  return items.map(workspaceId).find((id): id is string => id !== undefined)
}
