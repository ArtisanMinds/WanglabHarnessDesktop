/**
 * routes/attach/post.ts — POST /api/dsh-worktree/attach。
 *
 * 把已创建的工作树会话正式归属到源项目 Workspace（客户端在创建工作树后调用）。
 */

import type { HostContext } from '../../types'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { loadBinding } from '../../storage'

/** 归属请求体（形状校验在处理器内做，绝不信客户端类型）。 */
interface AttachBody {
  sessionId?: unknown
}

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as HostContext
  const body = (await readBody<AttachBody>(event)) ?? {}
  const sessionId = String(body.sessionId ?? '')
  if (!sessionId) {
    event.res.status = 400
    return { error: '缺少 sessionId' }
  }
  const binding = loadBinding(sessionId)
  if (!binding) {
    event.res.status = 404
    return { error: '未找到绑定的工作树' }
  }
  const workspace = await host.workspaceRegistry.resolveByPath(binding.projectPath)
  if (!workspace) {
    event.res.status = 404
    return { error: `未找到源工作区：${binding.projectPath}` }
  }
  await workspace.attachSession(sessionId)
  return { ok: true, workspaceId: workspace.id }
})
