/**
 * dsh-tauri-rightclick 客户端插件体（browser half）：原生风格的完整右键菜单。
 *
 * 按目标组装菜单（全部为稳定的无障碍语义 + 零结构补丁，无 React 组件、无运行时
 * 依赖）：
 *   - 会话行：官方重命名/归档/分叉转交官方组件；插件补充资源管理器打开目录、复制目录/会话 ID；
 *   - 工作区行：新建会话、打开目录、官方重命名、复制路径、归档工作区；
 *   - 未分组行：归档全部未分组正式会话、刷新；临时新会话不处理；
 *   - 可编辑元素：撤销/重做/剪切/复制/粘贴/全选；
 *   - 对话正文/设置页：复制所选文本、默认浏览器打开链接、全选当前内容；
 *   - 所有菜单：刷新。
 *
 * 与 node half（src/index.ts）经 /api/dsh-rightclick-menu/* 通信（open-url）。
 *
 * 两处装配：
 *   1. 样式表：`mountStyle` 引用计数挂载，经 `defineRegister` 统一释放；
 *   2. 文案 + 右键菜单：收敛在 {@link feature}（`defineRegister`）里，跨内核的
 *      `sessions` / `workspaces` 服务布局差异由它的 `adapter` 承担（取代迁移前的 `compat(ctx)`）。
 */
import type { ClientContext } from 'dsh-tauri/client'
import { mountStyle } from 'dsh-tauri-ui/client'
import { defineRegister } from 'dsh-tauri/client'
import {
  RIGHTCLICK_CLIENT_PLUGIN,
  RIGHTCLICK_MENU_EFFECT,
  RIGHTCLICK_MENU_STYLE_ID,
  RIGHTCLICK_STYLES_EFFECT,
} from './constants'
import { feature } from './register/features'
import rightClickStyle from './styles/index.cssr'

/** 插件显示名（诊断元数据）。 */
export const name = RIGHTCLICK_CLIENT_PLUGIN

/** 需要的客户端服务：locale（双语文案）、sessions（会话行匹配）、workspaces（工作区操作）。 */
export const inject = ['locale', 'sessions', 'workspaces']

/**
 * 插件体：安装样式与文案，并挂载右键菜单监听。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  // 1) 样式表挂载（mountStyle 引用计数幂等，卸载由 defineRegister 统一释放）。
  ctx.effect(
    defineRegister<ClientContext>(ctx, () => mountStyle(rightClickStyle, RIGHTCLICK_MENU_STYLE_ID)),
    RIGHTCLICK_STYLES_EFFECT,
  )

  // 2) 双语文案 + 右键菜单控制器（同一 feature：locale 与菜单控制器共用适配后的上下文，
  //    卸载时一并释放，不再有迁移前「registerLocale 裸调、注销句柄无人持有」的泄漏）。
  ctx.effect(feature, RIGHTCLICK_MENU_EFFECT)
}
