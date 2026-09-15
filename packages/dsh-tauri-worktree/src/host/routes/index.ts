/**
 * host/routes/index.ts — 工作树 HTTP 路由（`/api/dsh-worktree/*`，RESTful 资源化：
 * **文件路径 = URL 路径**）。
 *
 * 资源树（`routes/` 即集合根 `${WORKTREE_API_PREFIX}`）：
 *   POST   /api/dsh-worktree            在 worktree 集合上创建工作树（post.ts）
 *   DELETE /api/dsh-worktree            删除工作树（放弃更改，会话保留）（delete.ts）
 *   GET    /api/dsh-worktree/bindings   读绑定集合 + 未收敛删除任务（bindings/get.ts）
 *   GET    /api/dsh-worktree/status     读单个会话的工作树状态（status/get.ts）
 *   POST   /api/dsh-worktree/attach     把工作树会话归属到源项目 Workspace（attach/post.ts）
 *   POST   /api/dsh-worktree/checkout   检出本地并带回会话历史（checkout/post.ts）
 *
 * attach / checkout 是**跨资源的命令式状态迁移**（前者改的是源 Workspace 的会话归属，
 * 后者同时做 git 检出、新建本地会话并删除工作树），既不可 GET/DELETE，也不是可寻址的
 * 集合成员，因此保留为集合根下的动作子路径（POST + 动词），不伪装成 CRUD 资源。
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条）：本文件只做
 * 「导入 feature 处理器 + 登记 (方法, 路径)」，每个处理器的实现放在
 * `./<feature>/<method>.ts`（集合根的两个方法直接是 `./post.ts` / `./delete.ts`），
 * 文件内默认导出一个 h3 处理器（`defineEventHandler` 已在其内定义，这里不再二次包装）。
 *
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更方法仅回环 + 跨源校验、
 * 1 MiB 请求体上限**全部由 `defineRoutes` 统一承担**，处理器里不再重复实现；
 * 旧核的 `routeHandler` / `withConnectionAuth` 已废弃。
 *
 * 处理器需要的 apply 期依赖（插件配置 / 数据根 / 删除任务登记表）无法从事件取回，因此经注册期
 * 第二参数传入、请求期由处理器用 `dshRouteDepsOf<WorktreeRouteDeps>(event)` 取回；deps 由本次
 * 注册的闭包捕获，同一份声明在两组 deps 下注册时各读各的，没有模块级可变状态。宿主 ctx 本身仍由处理器经
 * `dshContextOf(event)` 取回。
 *
 * 运行期注册：`ctx.effect(() => routes(ctx, deps), 'dsh-tauri-worktree: routes')`。
 */

import type { WorktreeRouteDeps } from '../types'
import { defineRoutes } from 'dsh-tauri'
import { WORKTREE_API_PREFIX } from '../../shared/constants'
import attach from './attach/post'
import bindings from './bindings/get'
import checkout from './checkout/post'
import deleteWorktree from './delete'
import postWorktree from './post'
import status from './status/get'

export const routes = defineRoutes<WorktreeRouteDeps>((disposer) => {
  disposer.post({ kind: 'exact', path: WORKTREE_API_PREFIX }, postWorktree)
  disposer.delete({ kind: 'exact', path: WORKTREE_API_PREFIX }, deleteWorktree)
  disposer.get({ kind: 'exact', path: `${WORKTREE_API_PREFIX}/bindings` }, bindings)
  disposer.get({ kind: 'exact', path: `${WORKTREE_API_PREFIX}/status` }, status)
  disposer.post({ kind: 'exact', path: `${WORKTREE_API_PREFIX}/attach` }, attach)
  disposer.post({ kind: 'exact', path: `${WORKTREE_API_PREFIX}/checkout` }, checkout)
})
