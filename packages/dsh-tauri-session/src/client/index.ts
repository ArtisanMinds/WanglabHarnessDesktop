/**
 * client/index.ts — 归档管理客户端装配入口。
 *
 * 只做 import + 组装：三个 `defineRegister` feature（locale / 设置分区 /
 * 工作区补丁）各自收敛一类运行时资源，经 `ctx.effect` 挂载与卸载；
 * 跨核心版本的服务布局差异由 feature 的 `adapter`（第三个参数）承担，
 * 装配层不再自行 `compat(ctx)`。无业务实现。
 */

import type { ClientContext } from 'dsh-tauri/client'
import {
  SESSION_ARCHIVE_PATCH_EFFECT,
  SESSION_ARCHIVE_SECTION_EFFECT,
  SESSION_LOCALE_EFFECT,
} from './constants'
import { archiveSectionFeature } from './register/archive-section'
import { localeFeature } from './register/locale'
import { workspacePatchFeature } from './register/workspace-patch'

/** 插件显示名（诊断元数据）。 */
export const name = 'dsh-tauri-session'

/** 需要的客户端服务：slots / locale / sessions / workspaces。 */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/**
 * 插件体：安装文案与状态，注册「归档」设置分区，并安装工作区浏览器补丁。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  // 1) 双语字典 + locale → store.locale revision 桥接。
  ctx.effect(localeFeature, SESSION_LOCALE_EFFECT)

  // 2) 设置页「归档」分区（settings.section 单槽注册；导航行/内容由官方设置侧边栏投影）。
  ctx.effect(archiveSectionFeature, SESSION_ARCHIVE_SECTION_EFFECT)

  // 3) 工作区浏览器补丁：替换「删除工作区」+ 隐藏归档会话行。
  ctx.effect(workspacePatchFeature, SESSION_ARCHIVE_PATCH_EFFECT)
}
