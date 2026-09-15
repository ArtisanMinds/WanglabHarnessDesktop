/**
 * host/routes/index.ts — 归档管理 HTTP 路由（`/api/dsh-session/session/*`，RESTful
 * 资源化：文件路径即 URL 路径）。
 *
 * 资源树：
 *   GET    /session/archive                    读归档集合（session/archive/get.ts）
 *   POST   /session/archive                    归档单个会话（session/archive/post.ts）
 *   DELETE /session/archive                    彻底删除单个归档会话（session/archive/delete.ts）
 *   POST   /session/archive/clear              清空归档（session/archive/clear/post.ts）
 *   DELETE /session/archive/clear              清空归档（同一处理器）
 *   POST   /session/workspace/archive          归档一组会话（session/workspace/archive/post.ts）
 *   DELETE /session/workspace/archive          删除项目内归档会话（session/workspace/archive/delete.ts）
 *   POST   /session/unarchive                  取消归档（session/unarchive/post.ts）
 *   POST   /session/open-path                  在文件管理器中打开会话数据目录（session/open-path/post.ts）
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条）：本文件只做
 * 「导入 feature 处理器 + 登记 (方法, 路径)」，每个处理器的实现放在对应的
 * `<feature>/<method>.ts` 文件里（`defineEventHandler` 已在其内定义，这里不再二次包装）。
 * 同一路径的多个方法（如 `/session/archive` 的 GET/POST/DELETE）由宿主收敛为一行注册。
 *
 * 运行期由 `apply` 的 `ctx.effect(() => routes(ctx), '<plugin>: routes')` 注册。
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更操作的回环与跨源
 * 校验、1 MiB 请求体上限全部由 `defineRoutes` 统一承担。
 */

import { defineRoutes } from 'dsh-tauri'
import { SESSION_API_PREFIX } from '../../shared/constants'
import clearSessionArchive from './session/archive/clear/post'
import deleteSessionArchive from './session/archive/delete'
import getSessionArchive from './session/archive/get'
import postSessionArchive from './session/archive/post'
import postSessionOpenPath from './session/open-path/post'
import postSessionUnarchive from './session/unarchive/post'
import deleteSessionWorkspaceArchive from './session/workspace/archive/delete'
import postSessionWorkspaceArchive from './session/workspace/archive/post'

/** 归档资源根：`/api/dsh-session/session/archive`。 */
const SESSION_ARCHIVE = `${SESSION_API_PREFIX}/session/archive`

/** 工作区归档资源根：`/api/dsh-session/session/workspace/archive`。 */
const SESSION_WORKSPACE_ARCHIVE = `${SESSION_API_PREFIX}/session/workspace/archive`

/**
 * 归档管理路由声明。运行期注册：`ctx.effect(() => routes(ctx), '<plugin>: routes')`。
 *
 * 同一路径只允许声明一次（宿主按 (kind, path) 收敛为一行注册），方法分发交给 h3。
 */
export const routes = defineRoutes((disposer) => {
  // /session/archive —— 归档集合本身：读列表 / 归档一个 / 彻底删除一个。
  disposer.get({ kind: 'exact', path: SESSION_ARCHIVE }, getSessionArchive)
  disposer.post({ kind: 'exact', path: SESSION_ARCHIVE }, postSessionArchive)
  disposer.delete({ kind: 'exact', path: SESSION_ARCHIVE }, deleteSessionArchive)

  // /session/archive/clear —— 清空归档（POST 与 DELETE 指向同一处理器）。
  disposer.post({ kind: 'exact', path: `${SESSION_ARCHIVE}/clear` }, clearSessionArchive)
  disposer.delete({ kind: 'exact', path: `${SESSION_ARCHIVE}/clear` }, clearSessionArchive)

  // /session/workspace/archive —— 工作区维度的归档集合：归档一组 / 删除一组。
  disposer.post({ kind: 'exact', path: SESSION_WORKSPACE_ARCHIVE }, postSessionWorkspaceArchive)
  disposer.delete({ kind: 'exact', path: SESSION_WORKSPACE_ARCHIVE }, deleteSessionWorkspaceArchive)

  // /session/unarchive —— 取消归档（会话回到其工作区组保留的位置）。
  disposer.post({ kind: 'exact', path: `${SESSION_API_PREFIX}/session/unarchive` }, postSessionUnarchive)

  // /session/open-path —— 在系统文件管理器中打开会话数据目录。
  disposer.post({ kind: 'exact', path: `${SESSION_API_PREFIX}/session/open-path` }, postSessionOpenPath)
})
