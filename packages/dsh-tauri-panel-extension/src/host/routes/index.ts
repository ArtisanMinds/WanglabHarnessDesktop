/**
 * host/routes/index.ts — 能力管理器 HTTP 路由（`/dsh-tauri-panel-extension/*`）。
 *
 * 声明协议（见 docs/plugins/dsh-tauri-设计重构迁移.md 第 1 条 + 第 6.1 节）：本文件只做
 * 「导入 handler + 登记 (方法, 路径)」，每个处理器的实现放在 `./<资源路径>/<method>.ts`
 * 下，文件内默认导出一个 h3 处理器（`defineEventHandler` 已在其内定义，这里不再二次包装）。
 *
 * **目录层级 = URL 层级**（用户硬性要求）：`routes/` 下的相对目录路径与
 * `API_PREFIX` 之后的 URL 路径严格 1:1，URL 里几段，目录就几层。例如
 * `POST ${API_PREFIX}/mcp/save` 落在 `routes/mcp/save/post.ts`，
 * `GET ${API_PREFIX}/import/scan` 落在 `routes/import/scan/get.ts`。
 *
 * 路由表（URL 与迁移前逐字相同，仅目录层级对齐）：
 *   GET  /skills           技能目录
 *   POST /skills/refresh   重挂 provider 后重扫
 *   GET  /skill            单个技能内容（?name=）
 *   POST /skill/save       保存技能
 *   POST /skill/delete     删除用户技能
 *   POST /skill/policy     切换技能加载策略
 *   POST /open             打开技能目录 / 仓库目录
 *   GET  /mcp              MCP 行列表（global + profile 合并）
 *   POST /mcp/save         新增 / 覆盖一行
 *   POST /mcp/toggle       启停一行
 *   POST /mcp/remove       移除一行
 *   POST /mcp/check        连通性检查
 *   POST /mcp/copy         复制到另一 patch 层
 *   GET  /import/scan      扫描外部 agent 的 MCP 配置
 *   POST /import/apply     导入选中项
 *   GET  /roots            自定义技能仓库列表
 *   POST /roots/add        注册仓库（local / git）
 *   POST /roots/remove     注销仓库
 *   POST /restart          独立 `dsh web` 自重启
 *
 * 运行期由 `apply` 的 `ctx.effect(() => routes(ctx, deps), '<plugin>: routes')` 注册。
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权（401/403）、变更操作的回环与跨源
 * 校验、1 MiB 请求体上限全部由 `defineRoutes` 统一承担，处理器里不再重复实现。
 *
 * 处理器需要的 apply 期依赖（profile patch 目录 / 数据根 / provider 重挂载）无法从事件
 * 里的宿主 ctx 取回，因此经注册期第二参数传入、请求期由处理器用 `dshRouteDepsOf(event)`
 * 取回；deps 由本次注册的闭包捕获，同一份声明在两组 deps 下注册时各读各的，没有模块级可变状态。
 */

import type { ExtensionRouteDeps } from '../types'
import { defineRoutes } from 'dsh-tauri'
import { API_PREFIX } from '../../shared/constants'
import importApply from './import/apply/post'
import importScan from './import/scan/get'
import mcpCheck from './mcp/check/post'
import mcpCopy from './mcp/copy/post'
import mcp from './mcp/get'
import mcpRemove from './mcp/remove/post'
import mcpSave from './mcp/save/post'
import mcpToggle from './mcp/toggle/post'
import open from './open/post'
import restart from './restart/post'
import rootsAdd from './roots/add/post'
import roots from './roots/get'
import rootsRemove from './roots/remove/post'
import skillDelete from './skill/delete/post'
import skill from './skill/get'
import skillPolicy from './skill/policy/post'
import skillSave from './skill/save/post'
import skills from './skills/get'
import skillsRefresh from './skills/refresh/post'

/**
 * 能力管理器路由声明：URL 与 `routes/**` 目录逐段对齐（`mcp/save/post.ts` ↔
 * POST `${API_PREFIX}/mcp/save`，其余同理）。
 *
 * @returns `registerRoutes(ctx, deps)` —— 注册全部路由并返回卸载函数（交给 `ctx.effect`）。
 */
export const routes = defineRoutes<ExtensionRouteDeps>((disposer) => {
  disposer.get({ kind: 'exact', path: `${API_PREFIX}/skills` }, skills)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/skills/refresh` }, skillsRefresh)
  disposer.get({ kind: 'exact', path: `${API_PREFIX}/skill` }, skill)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/skill/save` }, skillSave)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/skill/delete` }, skillDelete)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/skill/policy` }, skillPolicy)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/open` }, open)

  disposer.get({ kind: 'exact', path: `${API_PREFIX}/mcp` }, mcp)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/mcp/save` }, mcpSave)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/mcp/toggle` }, mcpToggle)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/mcp/remove` }, mcpRemove)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/mcp/check` }, mcpCheck)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/mcp/copy` }, mcpCopy)

  disposer.get({ kind: 'exact', path: `${API_PREFIX}/import/scan` }, importScan)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/import/apply` }, importApply)

  disposer.get({ kind: 'exact', path: `${API_PREFIX}/roots` }, roots)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/roots/add` }, rootsAdd)
  disposer.post({ kind: 'exact', path: `${API_PREFIX}/roots/remove` }, rootsRemove)

  disposer.post({ kind: 'exact', path: `${API_PREFIX}/restart` }, restart)
})
