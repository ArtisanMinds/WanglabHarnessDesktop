/**
 * host/routes/index.ts — 桌宠宿主 HTTP 路由声明（`/api/dsh-pet/*`）。
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条）：本文件只做
 * 「导入 feature 处理器 + 登记 (方法, 路径)」，每个处理器的实现放在
 * `./<feature>/<method>.ts`（本插件只有 `./session-stream/get.ts`，文件内默认导出
 * 一个 h3 处理器，这里不再二次包装）。
 *
 * 运行期由 apply 的 `ctx.effect(() => routes(ctx), '<plugin>: routes')` 注册。
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更操作的回环与跨源
 * 校验、1 MiB 请求体上限全部由 `defineRoutes` 统一承担。
 */
import { defineRoutes } from 'dsh-tauri'
import { SESSION_STREAM_PATH } from '../../shared/constants'
import sessionStream from './session-stream/get'

/** 桌宠路由声明。运行期注册：`ctx.effect(() => routes(ctx), '<plugin>: routes')`。 */
export const routes = defineRoutes((disposer) => {
  disposer.get({ kind: 'exact', path: SESSION_STREAM_PATH }, sessionStream)
})
