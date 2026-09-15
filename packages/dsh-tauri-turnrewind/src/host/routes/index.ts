/**
 * host/routes/index.ts — turnrewind HTTP 路由（客户端 UI 唯一的数据面）。
 *
 *   GET  /api/turnrewind/session/summary?sessionId=<id>  读本会话的 turn 变更记录
 *   GET  /api/turnrewind/session/live?sessionId=<id>     读运行中实时读数（客户端提示条）
 *   POST /api/turnrewind/session/undo                    撤销某个 turn 的文件改动
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条）：本文件只做
 * 「导入 feature 处理器 + 登记 (方法, 路径)」，每个处理器的实现放在
 * `./<feature>/<method>.ts`（`./session/summary/get.ts`、`./session/live/get.ts`、
 * `./session/undo/post.ts`），文件内默认导出一个 h3 处理器
 * （`defineEventHandler` 已在其内定义，这里不再二次包装）。
 *
 * **目录层级即 URL 层级**：`routes/session/<子资源>/<方法>.ts` 逐段对应
 * `/api/turnrewind/session/<子资源>`；改目录必须同步改这里的登记路径与
 * `client/apis` 的 fetch URL（唯一数据面，两处必须逐字一致）。
 *
 * 方法限制、OPTIONS 204、连接信任边界（401/403）、变更方法仅回环 + 跨源校验、
 * 请求体 1 MiB 上限**全部由 `defineRoutes` 承担**，处理器里不再重复实现。
 *
 * 处理器需要的 apply 期依赖（队列、实时读数、未落定判定、数据根）无法从事件取回，
 * 因此经注册期第二参数传入、请求期由处理器用 `dshRouteDepsOf<TurnrewindRouteDeps>(event)`
 * 取回；deps 由本次注册的闭包捕获，同一份声明在两组 deps 下注册时各读各的，没有模块级可变状态。
 * 宿主 ctx 本身仍由处理器经 `dshContextOf(event)` 取回。
 */

import type { TurnrewindRouteDeps } from '../types'
import { defineRoutes } from 'dsh-tauri'
import { TURNREWIND_API_PREFIX } from '../../shared/constants'
import live from './session/live/get'
import summary from './session/summary/get'
import undo from './session/undo/post'

/**
 * turnrewind 路由声明：URL 与 `routes/**` 目录逐段对齐（`session/live/get.ts` ↔
 * GET `${TURNREWIND_API_PREFIX}/session/live`，其余同理）。
 *
 * @returns `routes(ctx, deps)` —— 注册三条路由并返回卸载函数（交给 `ctx.effect`）。
 */
export const routes = defineRoutes<TurnrewindRouteDeps>((disposer) => {
  // 路径与 `./session/<子资源>/<方法>.ts` 逐段对应，不再有平铺的 feature 目录。
  disposer.get({ kind: 'exact', path: `${TURNREWIND_API_PREFIX}/session/summary` }, summary)
  disposer.get({ kind: 'exact', path: `${TURNREWIND_API_PREFIX}/session/live` }, live)
  disposer.post({ kind: 'exact', path: `${TURNREWIND_API_PREFIX}/session/undo` }, undo)
})
