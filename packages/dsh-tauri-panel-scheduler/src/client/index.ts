/**
 * client/index.ts — 调度器客户端装配入口。
 *
 * 只做 import + 组装：四个 `defineRegister` feature（locale / 面板条目 /
 * Chat 预填桥 / 会话行时钟图标）各自收敛一类运行时资源，经 `ctx.effect` 挂载与
 * 卸载；样式表挂载是单条 disposer，直接交给 `ctx.effect`。无业务实现。
 * 结构分层见 AGENTS.md 客户端目录模板：types/ utils/ apis/ store/ styles/
 * components/ register/ 各司其职。
 */

import type { SchedulerClientContext } from './types'
import { mountStyle } from 'dsh-tauri-ui/client'
import { LOCALE_EFFECT, PANEL_EFFECT, PLUGIN_ID, PREFILL_EFFECT, SESSION_ICONS_EFFECT, STYLE_ID, STYLES_EFFECT } from './constants'
import { localeFeature } from './locales'
import { panelFeature } from './register/panel'
import { prefillFeature } from './register/prefill'
import { sessionIconsFeature } from './register/session-icons'
import schedulerIndexStyle from './styles/index.cssr'

export { SCHEDULER_API_PREFIX } from '../shared/constants'
export type * from './types'

/** 插件显示名（诊断元数据）。 */
export const name = PLUGIN_ID

/** 需要的客户端服务：slots（注册点位）、locale（双语文案）。 */
export const inject = ['slots', 'layout', 'locale', 'sessions', 'workspaces']

/**
 * 插件体：安装文案与样式，注册面板条目、Chat 预填桥与会话行图标补丁。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: SchedulerClientContext): void {
  ctx.effect(localeFeature, LOCALE_EFFECT)
  ctx.effect(() => mountStyle(schedulerIndexStyle, STYLE_ID), STYLES_EFFECT)
  ctx.effect(panelFeature, PANEL_EFFECT)
  ctx.effect(prefillFeature, PREFILL_EFFECT)
  ctx.effect(sessionIconsFeature, SESSION_ICONS_EFFECT)
}
