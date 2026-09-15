/**
 * host/routes/index.ts — 右键菜单宿主路由（`/api/dsh-rightclick-menu/*`）：open-url / open-path。
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条）：本文件只做
 * 「导入 feature 处理器 + 登记 (方法, 路径)」，每个处理器的实现放在
 * `./<feature>/<method>.ts`（`./open-url/post.ts`、`./open-path/post.ts`），文件内默认
 * 导出一个 h3 处理器（`defineEventHandler` 已在其内定义，这里不再二次包装）。
 *
 * 运行期由 `apply` 的 `ctx.effect(() => routes(ctx), '<plugin>: routes')` 注册。
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更操作的回环与跨源
 * 校验、1 MiB 请求体上限全部由 `defineRoutes` 统一承担。
 */

import { defineRoutes } from 'dsh-tauri'
import { OPEN_PATH_ROUTE, OPEN_URL_ROUTE } from '../../constants'
import openPath from './open-path/post'
import openUrl from './open-url/post'

/**
 * 右键菜单路由声明。运行期注册：`ctx.effect(() => routes(ctx), '<plugin>: routes')`。
 *
 * 同一路径只允许声明一次（宿主按 (kind, path) 收敛为一行注册），方法分发交给 h3。
 */
export const routes = defineRoutes((disposer) => {
  disposer.post({ kind: 'exact', path: OPEN_URL_ROUTE }, openUrl)
  disposer.post({ kind: 'exact', path: OPEN_PATH_ROUTE }, openPath)
})
