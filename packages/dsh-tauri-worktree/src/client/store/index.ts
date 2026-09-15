/**
 * store/index.ts — dsh-tauri-worktree 的客户端状态总入口（valtio-define 协议）。
 *
 * 领域 store 各自一个 `store/modules/<domain>.ts`；本文件只做聚合，并保留迁移前的
 * 公开读写入口（`hydratePreferredMode` / `preferredNewSessionMode` /
 * `rememberNewSessionMode` / `patchSession` / `selectSessionState` /
 * `useWorktreeSession`）为薄封装，调用点无需改动。
 *
 * 读写约定（spec §3）：外部读 `store.<domain>.<field>`，外部写
 * `store.<domain>.<field> = v` 或 `store.<domain>.<action>(...)`；组件内订阅用
 * `useStore(store.<domain>)`；非 React 消费方（DOM 补丁 / service）用
 * `store.<domain>.$subscribe(listener)` / `$subscribeKey` / `$patch` / `$state`。
 */

import type { WorktreeSessionState } from '../types'
import type { WorktreeNewSessionMode } from './modules/preferences'
import { useStore } from 'dsh-tauri/client'
import { locale } from './modules/locale'
import { preferences } from './modules/preferences'
import { blankState, EMPTY_STATE, worktree } from './modules/worktree'

export { blankState, EMPTY_STATE, locale, preferences, worktree }
export type { WorktreeNewSessionMode }

export type { WorktreePhase, WorktreeSessionState } from '../types'

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  worktree,
  preferences,
  locale,
}

/**
 * 组件读取的会话切片。
 *
 * `useStore` 返回的是**深只读**快照（数组被收敛为只读数组）；组件只读这份数据
 * （写入一律走 `patchSession`），因此这里显式声明只读视图类型，调用方不需要断言。
 */
export type WorktreeSessionView = Readonly<Omit<WorktreeSessionState, 'log'>> & { readonly log: readonly string[] }

/**
 * 取某会话的状态切片（无则空白态，引用稳定）。
 *
 * 签名对状态容器**结构开放**：既接受 valtio 的 `$state`（深只读代理），也接受可变引用；
 * 返回类型只保留切片字段，因此调用方不需要 `as` 断言。
 */
export function selectSessionState<C extends { bySession: Record<string, unknown> }>(state: C, sessionId: string | undefined): WorktreeSessionState {
  if (sessionId === undefined)
    return EMPTY_STATE
  return (state.bySession[sessionId] as WorktreeSessionState | undefined) ?? EMPTY_STATE
}

/** 更新某会话的 state（merge 语义）。 */
export function patchSession(sessionId: string | undefined, patch: Partial<WorktreeSessionState>): void {
  store.worktree.patch(sessionId, patch)
}

/** apply 时调用一次：异步读回用户上次选择的工作模式（失败保持默认「本地」）。 */
export function hydratePreferredMode(): Promise<void> {
  return store.preferences.hydrate()
}

/** 新会话沿用用户最近选择；存储不可用时保持官方默认「本地」。 */
export function preferredNewSessionMode(): WorktreeNewSessionMode {
  return store.preferences.preferredMode
}

/** 记住用户本次选择的新会话工作模式。 */
export function rememberNewSessionMode(mode: WorktreeNewSessionMode): void {
  store.preferences.remember(mode)
}

/** 组件内订阅某会话的工作树状态。 */
export function useWorktreeSession(sessionId: string | undefined): WorktreeSessionView {
  const { bySession } = useStore(store.worktree)
  if (sessionId === undefined)
    return EMPTY_STATE
  return bySession[sessionId] ?? EMPTY_STATE
}

export type { WorktreeCheckout, WorktreeCreate, WorktreeDiscard, WorktreeStatus, WorktreeUiState } from '../types'
