/**
 * route.ts — 归档管理 HTTP 路由（/api/dsh-session/*）：archived / open-path /
 * archive / archive-workspace / unarchive / delete / delete-workspace / clear。
 *
 * 变更类路由标注 mutate: true，统一由 withConnectionAuth 做连接鉴权；
 * 每个 handler 只是把 body 参数化后转交 archive.ts / session-files.ts 的业务函数，
 * 不内联业务逻辑。open-path 不接受客户端路径，按 sessionIds 在
 * `$DSH_HOME/sessions/...` 内有界解析会话数据目录后交给系统文件管理器。
 */

import type { HostContext } from '../types/index.js'
import { openDirectory, routeHandler, withConnectionAuth } from 'dsh-tauri'
import { SESSION_API_PREFIX, SESSION_PLUGIN_NAME } from '../../shared/constants.js'
import {
  archiveSession,
  archiveWorkspace,
  buildArchivedPayload,
  permanentlyDeleteAll,
  permanentlyDeleteSelected,
  permanentlyDeleteSession,
  unarchiveSession,
} from '../service/archive.js'
import { resolveSessionGroupDirectory } from '../service/session-files.js'

const MAX_OPEN_SESSION_IDS = 500

/** 构建路由列表。 */
export function buildRoutes(ctx: HostContext, dshHome: string): any[] {
  const routes = [
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/archived`,
      handler: routeHandler(async () => [200, buildArchivedPayload(ctx)]),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/open-path`,
      handler: routeHandler(async (body) => {
        const rawIds = Array.isArray(body?.sessionIds) ? body.sessionIds : []
        const sessionIds = rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        if (sessionIds.length === 0 || sessionIds.length > MAX_OPEN_SESSION_IDS)
          return [400, { ok: false, error: 'invalid-session-ids' }]
        const directory = resolveSessionGroupDirectory(dshHome, sessionIds)
        if (!directory)
          return [400, { ok: false, error: 'session-directory-not-found' }]
        if (!openDirectory(directory))
          return [400, { ok: false, error: 'not-a-directory' }]
        return [200, { ok: true }]
      }, { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/archive`,
      handler: routeHandler(async body => [200, await archiveSession(ctx, body)], { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/archive-workspace`,
      handler: routeHandler(async body => [200, await archiveWorkspace(ctx, body)], { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/unarchive`,
      handler: routeHandler(async body => [200, await unarchiveSession(ctx, body)], { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/delete`,
      handler: routeHandler(async body => [200, await permanentlyDeleteSession(ctx, dshHome, body)], { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/delete-workspace`,
      handler: routeHandler(async body => [200, await permanentlyDeleteSelected(ctx, dshHome, body)], { mutate: true }),
    },
    {
      kind: 'exact',
      path: `${SESSION_API_PREFIX}/clear`,
      handler: routeHandler(async () => [200, await permanentlyDeleteAll(ctx, dshHome)], { mutate: true }),
    },
  ]
  return routes.map(route => ({
    ...route,
    handler: withConnectionAuth(ctx.connection, route.handler, SESSION_PLUGIN_NAME),
  }))
}
