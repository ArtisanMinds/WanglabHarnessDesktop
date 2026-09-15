/**
 * routes/post.ts — POST /api/dsh-worktree（worktree 集合资源上创建，文件路径 = URL 路径：
 * `routes/` 即集合根 `${WORKTREE_API_PREFIX}`）。
 *
 * 为预分配的新会话创建工作树；`inherit: true` 时再用源会话的完整事件作 seed 建好
 * 「已是完整会话」的工作树会话（否则回退官方空白会话路径）。
 *
 * 写边界（方法限制、连接信任、非回环 / 跨源 403、1 MiB 体上限）由 `defineRoutes` 承担；
 * 处理器体内做形状校验、状态码与响应组织，领域服务只收具体参数。
 */

import type { HostContext, WorktreeRouteDeps } from '../types'
import { defineEventHandler, dshContextOf, dshRouteDepsOf, readBody } from 'dsh-tauri'
import { inheritSessionIntoWorktree } from '../service/handoff'
import { ensureWorktree, worktreeKey } from '../service/operation'
import { findSession, resolveProjectPath } from '../service/session'

/** 创建工作树请求体（形状校验在处理器内做，绝不信客户端类型）。 */
interface CreateBody {
  sessionId?: unknown
  sourceSessionId?: unknown
  carryStaged?: unknown
  inherit?: unknown
}

export default defineEventHandler(async (event) => {
  const { config } = dshRouteDepsOf<WorktreeRouteDeps>(event)!
  const host = dshContextOf(event) as unknown as HostContext
  const body = (await readBody<CreateBody>(event)) ?? {}
  const sessionId = String(body.sessionId ?? '')
  const sourceSessionId = String(body.sourceSessionId ?? sessionId)
  if (!sessionId) {
    event.res.status = 400
    return { error: '缺少 sessionId' }
  }
  const sourceSession = findSession(host, sourceSessionId)
  const projectPath = await resolveProjectPath(host, sourceSession)
  if (!projectPath) {
    event.res.status = 400
    return { error: '无法解析会话工作目录：会话尚未就绪，请稍后重试' }
  }
  const r = await ensureWorktree(host, projectPath, sessionId, {
    sourceSessionId,
    carryStaged: body.carryStaged === true,
    linkDependencies: config.linkDependencies,
    linkDependencyDirectories: config.linkDependencyDirectories,
  })
  if (!r.ok) {
    event.res.status = 400
    return { error: r.error }
  }
  // 继承源会话完整对话历史：仅当客户端请求 inherit 且源会话确有事件时，宿主才用
  // sourceSession.events 作为 seed 建好「已是完整会话」的工作树会话（问题 2 的修复）。
  // 否则回退官方空白会话路径（客户端用 sessionsRuntime.create({ cwd }) 兜底）。
  let inherited = false
  if (body.inherit === true) {
    const inheritedSession = await inheritSessionIntoWorktree(
      host,
      sourceSessionId,
      sessionId,
      r.binding.worktreePath,
    )
    inherited = inheritedSession.ok
  }
  return {
    ok: true,
    hash: r.binding.hash,
    dirname: r.binding.dirname,
    worktreeKey: worktreeKey(r.binding.hash, r.binding.dirname),
    worktreePath: r.binding.worktreePath,
    projectPath: r.binding.projectPath,
    sourceSessionId: r.binding.sourceSessionId,
    log: r.log,
    existed: r.existed,
    inherited,
  }
})
