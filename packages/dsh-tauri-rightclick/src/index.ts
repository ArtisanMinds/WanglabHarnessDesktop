/**
 * dsh-tauri-rightclick 宿主侧（node half）：系统浏览器开链 + 文件管理器打开目录。
 *
 * 客户端（src/client/）负责右键菜单的 DOM 交互；本 half 只提供宿主能力：
 *   - POST /api/dsh-rightclick-menu/open-url 用系统默认浏览器打开 http/https 外链
 *     （原生文件系统打开能力不接受 URL，URL 必须走这里）；
 *   - POST /api/dsh-rightclick-menu/open-path 在系统文件管理器中打开本地目录
 *     （不依赖核心 Remote 服务，新旧核心均可用）。
 *
 * 目录分层：
 *   - index.ts（本文件）  public barrel（公开面不变）；
 *   - constants.ts        跨 half 协议常量（插件名 / API 前缀 / 两条路由路径）；
 *   - host/routes/        路由声明（index.ts）+ 每个 feature 一个目录、HTTP 方法名做文件名；
 *   - host/service/       领域服务（宿主变更串行队列）；
 *   - host/apply.ts       插件装配：`ctx.effect(() => routes(ctx), '<plugin>: routes')`；
 *   - client/             Browser half（右键菜单控制器 + 文案 + 样式）。
 *
 * 路由只接受同源 JSON POST：方法限制 / OPTIONS / 连接鉴权 / 变更方法的回环与跨源校验 /
 * 1 MiB 请求体上限由 `defineRoutes` 统一承担，处理器内只保留请求级逻辑
 * （读体、校验、置状态码、组织响应）。
 */

import { RIGHTCLICK_API_PREFIX, RIGHTCLICK_PLUGIN_NAME } from './constants'

/** 插件名（诊断元数据，与导出的 name 一致）。 */
export const name = RIGHTCLICK_PLUGIN_NAME

/** 需要的宿主服务：webServer（HTTP 路由）、connection（DSH 连接信任边界）。 */
export const inject = ['webServer', 'connection']

/** API 路由前缀（客户端同源 fetch）。 */
export const API_PREFIX = RIGHTCLICK_API_PREFIX

export { apply } from './host/apply'
export { routes } from './host/routes'
