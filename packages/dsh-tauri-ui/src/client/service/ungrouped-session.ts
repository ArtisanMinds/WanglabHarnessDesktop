import type { ClientAdapter, ClientContext, SessionId } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'

/** 会话列表快照中本服务读取的字段（`current` 在 0.1.7 由适配层投影补回）。 */
interface ListSnapshotLike {
  current?: SessionId
  byId?: Record<string, { blank?: boolean } | undefined>
}

/**
 * 未分组新建会话：不传 workspaceId/cwd，宿主按默认 cwd 建会话且不 attach 任何工作区。
 *
 * `adapter` 负责跨内核代的会话能力：`open` 在 ≤0.1.6 位于 `sessions`，0.1.7 收进
 * `uiWorkspace.openSession`；列表快照的 `current` 在 0.1.7 也改由 `uiSession` 投影补回。
 * 省略 `adapter` 时回退原生 `ctx.sessions`（旧内核与单测路径）。
 */
export function startUngroupedSession(ctx: ClientContext, adapter?: ClientAdapter): void {
  void connectUngroupedSession(ctx, adapter).then(
    (sessionId) => {
      openSession(ctx, adapter, sessionId)
      ctx.layout.selectPanel(null)
    },
    (reason: unknown) => {
      console.warn(`[${PLUGIN_ID}] 未分组新建会话失败:`, reason)
    },
  )
}

async function connectUngroupedSession(ctx: ClientContext, adapter?: ClientAdapter): Promise<SessionId> {
  const current = snapshotOf(ctx, adapter).current
  if (current !== undefined && isUngroupedBlank(ctx, adapter, current))
    return current
  return ctx.sessions.create()
}

function isUngroupedBlank(ctx: ClientContext, adapter: ClientAdapter | undefined, sessionId: SessionId): boolean {
  const summary = snapshotOf(ctx, adapter).byId?.[sessionId]
  if (summary === undefined || !summary.blank)
    return false
  const workspaces = readWorkspaces(ctx)
  return workspaces === undefined || workspaces.every(workspace => !workspace.sessionIds.includes(sessionId))
}

/** 打开已有会话：适配层优先（0.1.7 走 `uiWorkspace.openSession`），缺席时回退原生成员。 */
function openSession(ctx: ClientContext, adapter: ClientAdapter | undefined, sessionId: SessionId): void {
  if (adapter !== undefined) {
    adapter.openSession(sessionId)
    return
  }
  const native = ctx.sessions as unknown as { open?: (id: SessionId) => unknown }
  native.open?.(sessionId)
}

function snapshotOf(ctx: ClientContext, adapter?: ClientAdapter): ListSnapshotLike {
  const list = adapter?.sessions.list ?? ctx.sessions.list
  return (list.getSnapshot() ?? {}) as ListSnapshotLike
}

interface WorkspacesRuntime {
  list: { getSnapshot: () => { items: readonly { sessionIds: readonly SessionId[] }[] } }
}

/** 走 `ctx.get` 并吞掉 inject-only 守卫的抛错：读不到时按「无法判断」处理，绝不阻断开会话。 */
function readWorkspaces(ctx: ClientContext): readonly { sessionIds: readonly SessionId[] }[] | undefined {
  try {
    const workspaces = ctx.get('workspaces') as WorkspacesRuntime | undefined
    return workspaces?.list.getSnapshot().items
  }
  catch {
    return undefined
  }
}
