/**
 * dsh-tauri-worktree 客户端插件体（browser half）：会话级 Git Worktree 隔离的 UI。
 *
 * 四项 UI（全部 slot-shadow / DOM 补丁，零结构补丁，零新增运行时依赖）：
 *   - components/mode-select.tsx  注册进 conversation.input.dock：模式选择下拉框（本地/工作树）
 *     及内联的会话处理状态与创建日志（三阶段）。
 *   - components/surface.tsx      注册进 conversation.input.dock：工作树模式的常驻状态条
 *     [ 该会话正在工作树进行 ] --- [ 检出本地 ] [ 放弃 ]。
 *   - components/dialog.tsx       注册进 shell.overlay：检出本地/放弃更改两个模态框。
 *   - register/session-icons.ts   DOM 补丁：侧边栏会话行时间标识左侧的 Git 分支图标。
 *
 * 目录规划：apis/（RPC 客户端）/ store/（valtio-define 状态 + unstorage 偏好）/
 * register/（locale / hydration / session-icons / slot 注册，一律 `defineRegister`）/
 * components/（UI 组件）/ utils/（纯函数）/ locales/（双语）。
 * 与 node half（host/）经 /api/dsh-worktree/* 通信（集合根的 POST 创建 / DELETE 删除，
 * 以及 bindings/status/attach/checkout）。
 */
import type { ClientContext } from 'dsh-tauri/client'
import { mountStyle } from 'dsh-tauri-ui/client'
import modeSelectStyle from './components/mode-select.cssr'
import {
  DIALOG_EFFECT,
  HYDRATION_EFFECT,
  LOCALE_EFFECT,
  MODE_SELECT_EFFECT,
  MODE_SELECT_STYLE_ID,
  SESSION_ICONS_EFFECT,
  STYLES_EFFECT,
  SURFACE_EFFECT,
  WORKTREE_PLUGIN_NAME,
  WORKTREE_STYLE_ID,
} from './constants'
import { dialogFeature } from './register/dialog'
import { hydrationFeature } from './register/hydration'
import { localeFeature } from './register/locale'
import { modeSelectFeature } from './register/mode-select'
import { sessionIconsFeature } from './register/session-icons'
import { surfaceFeature } from './register/surface'
import { hydratePreferredMode } from './store'
import worktreeIndexStyle from './styles/index.cssr'

export { WORKTREE_API_PREFIX } from '../shared/constants'
export type * from './types'

/** 插件显示名（诊断元数据）。 */
export const name = WORKTREE_PLUGIN_NAME

/** 需要的客户端服务：slots（注册点位）、layout（面板）、locale（双语）、sessions（会话行匹配）。 */
export const inject = ['slots', 'layout', 'locale', 'sessions', 'workspaces']

/**
 * 插件体：安装文案并注册四项 UI。
 *
 * 每个 feature 都经 `defineRegister` 收敛（控制器统一托管监听 / 定时器 / 槽位 inject 句柄），
 * 由 `ctx.effect(feature, '<plugin>: <feature>')` 注册，卸载统一释放。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(localeFeature, LOCALE_EFFECT)
  // 新会话偏好（本地/工作树）异步读回一次，未就绪前保持官方默认「本地」。
  void hydratePreferredMode()
  ctx.effect(
    () => {
      const disposeModeSelect = mountStyle(modeSelectStyle, MODE_SELECT_STYLE_ID)
      const disposeWorktree = mountStyle(worktreeIndexStyle, WORKTREE_STYLE_ID)
      return () => {
        disposeModeSelect()
        disposeWorktree()
      }
    },
    STYLES_EFFECT,
  )
  ctx.effect(modeSelectFeature, MODE_SELECT_EFFECT)
  ctx.effect(surfaceFeature, SURFACE_EFFECT)
  ctx.effect(dialogFeature, DIALOG_EFFECT)
  ctx.effect(hydrationFeature, HYDRATION_EFFECT)
  ctx.effect(sessionIconsFeature, SESSION_ICONS_EFFECT)
}
