/**
 * types/runtime.ts — 宿主运行时快照投影（`ctx.sessions` / `ctx.workspaces`）。
 *
 * 【来源】`dsh-tauri/client` 转出的上游 controller 面
 * （@deepseek-ai/dsh-api-session-controller/client、@deepseek-ai/dsh-api-workspace-controller/client，0.1.5-rc.2）。
 * 上游用 branded `SessionId` 参与集合运算，插件侧一律处理裸字符串，故快照投影把 id
 * 位放宽为 `string`；服务面直接取上游 `ISessions` / `IWorkspaces` 的成员子集。
 */

import type {
  ISessions,
  IWorkspaces,
  SessionListState,
  SessionSummary,
  WorkspaceId,
  WorkspaceSnapshot,
  WorkspaceView,
} from 'dsh-tauri/client'

export type SessionSummaryLike = SessionSummary
export type WorkspaceViewLike = WorkspaceView

/** 会话列表快照投影（`sessions.list` 的 `getSnapshot()` 值，id 放宽为 string）。 */
export type SessionListSnapshot = Omit<SessionListState, 'ids' | 'byId' | 'current'> & {
  ids: string[]
  byId: Record<string, SessionSummary>
  current?: string
}

/** 工作区快照投影（`workspaces.list` 的 `getSnapshot()` 值）。 */
export type WorkspaceListSnapshot = Pick<WorkspaceSnapshot, 'items' | 'archivedSessionIds'>

/** 官方 sessions 服务面：列表订阅 + 刷新 + 打开 + 绑定 + fork。 */
export type SessionsRuntimeLike = Pick<ISessions, 'list' | 'refresh' | 'open' | 'binding' | 'fork'>

/** 官方 workspaces 服务面 + 桌面导航扩展（`manager` / `startSession` 为核心版本兼容扩展）。 */
export type WorkspacesRuntimeLike = Pick<IWorkspaces, 'list' | 'archiveSession' | 'delete'> & {
  manager?: { refresh?: () => Promise<void> }
  startSession?: (workspaceId: WorkspaceId) => void
}
