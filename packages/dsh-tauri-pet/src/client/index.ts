/**
 * client/index.ts — dsh-tauri-pet 客户端插件体（browser half）：桌宠设置页 + 入口图标。
 *
 * 能力（slot-shadow，零结构补丁，零新增运行时依赖）：
 *   注册进 layout 声明的 `shell.overlay`（list/root 槽，第三方通用浮层）——
 *   侧栏「宠物入口」小图标（激活时右上角绿色圆点）+ 独立的「宠物」设置页
 *   （类归档页停靠面板）：启用/停用、显示/隐藏、选择桌宠（Codex/Deepseek），
 *   全部经 dsh-tauri invoke 桥调用桌面端 Tauri 命令
 *   （get_pet_status/set_pet_enabled/set_active_pet/show_pet/hide_pet）。
 *
 * 依赖：slots（注册点位）、locale（双语文案）。invoke 桥来自 dsh-tauri/client。
 */
import type { ClientContext } from 'dsh-tauri/client'
import { PET_CLIENT_PLUGIN } from './constants'
import { installLocale } from './locales'
import { installPetIcon, installPetSettings } from './register/pet'
import { mountPetStyles } from './styles'

/** 插件显示名（诊断元数据）。 */
export const name = PET_CLIENT_PLUGIN

/** 需要的客户端服务：slots（注册 shell.overlay）、locale（双语文案）。 */
export const inject = ['slots', 'locale']

/**
 * 插件体：安装文案、样式，并注册桌宠入口图标与独立设置页到 shell.overlay。
 * @param ctx - 客户端根上下文（须已注入 slots/locale）。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => mountPetStyles(), 'dsh-tauri-pet: styles')

  installLocale(ctx)

  installPetIcon(ctx)
  installPetSettings(ctx)
}
