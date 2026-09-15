/**
 * client/index.ts — 扩展面板客户端装配入口。
 *
 * 只做 import + 组装：三个 `defineRegister` feature（locale / 全局样式 / 技能创建器
 * 预填 / 扩展面板）各自收敛一类运行时资源，经 `ctx.effect` 挂载与卸载；跨核心版本的
 * 服务布局差异由 feature 的 `adapter`（第三个参数）承担，装配层不再自行 `compat(ctx)`。
 * 无业务实现。结构分层见 AGENTS.md 客户端目录模板：types/ utils/ hooks/ apis/
 * components/ register/ store/ 各司其职。
 */

import type { ExtensionClientContext } from './types'
import { mountStyle } from 'dsh-tauri-ui/client'
import { defineRegister } from 'dsh-tauri/client'
import { PLUGIN_ID, STYLE_ID } from './constants'
import { registerExtensionLocale } from './locales'
import { extensionPanelFeature } from './register/extension-panel'
import { skillCreatorPrefillFeature } from './register/skill-creator-prefill'
import extensionIndexStyle from './styles/index.cssr'

export const name = PLUGIN_ID
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/** 双语字典安装 feature（卸载时注销两个语言的注册句柄）。 */
const localeFeature = defineRegister<ExtensionClientContext>((controller, ctx) => {
  controller.add(registerExtensionLocale(ctx))
})

/** 全局样式 feature（css-render 树只在 effect 生命周期内挂载）。 */
const stylesFeature = defineRegister<ExtensionClientContext>((controller) => {
  controller.add(mountStyle(extensionIndexStyle, STYLE_ID))
})

export function apply(ctx: ExtensionClientContext): void {
  ctx.effect(localeFeature, `${PLUGIN_ID}: locale`)
  ctx.effect(stylesFeature, `${PLUGIN_ID}: styles`)
  ctx.effect(skillCreatorPrefillFeature, `${PLUGIN_ID}: skill creator prefill`)
  ctx.effect(extensionPanelFeature, `${PLUGIN_ID}: extension panel`)
}
