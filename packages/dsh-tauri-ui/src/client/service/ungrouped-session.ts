import type { ClientContext, SessionId } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'

/** 未分组新建会话：不传 workspaceId/cwd，宿主按默认 cwd 建会话且不 attach 任何工作区。 */
export function startUngroupedSession(ctx: ClientContext): void {
  void connectUngroupedSession(ctx).then(
    (sessionId) => {
      ctx.sessions.open(sessionId)
      ctx.layout.selectPanel(null)
    },
    (reason: unknown) => {
      console.warn(`[${PLUGIN_ID}] 未分组新建会话失败:`, reason)
    },
  )
}

async function connectUngroupedSession(ctx: ClientContext): Promise<SessionId> {
  const current = ctx.sessions.list.getSnapshot().current
  if (current !== undefined && isUngroupedBlank(ctx, current))
    return current
  return ctx.sessions.create()
}

function isUngroupedBlank(ctx: ClientContext, sessionId: SessionId): boolean {
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
  if (summary === undefined || !summary.blank)
    return false
  const workspaces = readWorkspaces(ctx)
  return workspaces === undefined || workspaces.every(workspace => !workspace.sessionIds.includes(sessionId))
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
