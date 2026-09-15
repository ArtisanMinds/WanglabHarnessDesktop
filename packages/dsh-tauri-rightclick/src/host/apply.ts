/**
 * host/apply.ts — 右键菜单插件装配：注册宿主 HTTP 路由。
 *
 * 路由声明在 host/routes（静态 `defineRoutes`），注册挂 effect：插件卸载即注销整张路由表。
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更方法的回环与跨源校验、
 * 1 MiB 请求体上限全部由 `defineRoutes` 承担，这里只做注册与卸载。
 */

import type { HostContext } from '../types'
import { RIGHTCLICK_PLUGIN_NAME } from '../constants'
import { routes } from './routes'

/**
 * 插件体：注册 HTTP 路由。
 * @param ctx - 宿主根上下文（注入 webServer / connection）。
 */
export function apply(ctx: HostContext): void {
  // routes(ctx) 返回本次注册的卸载函数；方法/连接/回环/跨源/体积边界由 defineRoutes 统一承担。
  ctx.effect(() => routes(ctx), `${RIGHTCLICK_PLUGIN_NAME}: routes`)
}
