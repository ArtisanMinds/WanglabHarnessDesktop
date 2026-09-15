/**
 * store/modules/session.ts — 每会话摘要缓存 + 撤销状态源（valtio-define 协议）。
 *
 * 状态只放数据（`bySession` 切片）；在飞请求合并与错误归一放在 `store/index.ts` 的薄封装里，
 * 本文件只承载状态源与写动作（spec §3：state 只放数据，函数放 actions，派生值放 getters）。
 */

import type { TurnrewindSessionState, TurnrewindUiState } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/**
 * 无缓存会话的空白态。
 *
 * 引用必须稳定（模块级常量）：getter 每次对缺席会话都返回同一个对象，
 * 订阅方才不会因为「每次读到新对象」而无休止重渲染（与迁移前的 uSES 口径一致）。
 */
export const EMPTY_SESSION_STATE: TurnrewindSessionState = {
  status: 'idle',
  summary: null,
  error: null,
  attempts: {},
  undoing: false,
  undoError: null,
  undoConflicts: [],
}

/** 每会话客户端状态源（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const turnrewind = defineStore({
  state: (): TurnrewindUiState => ({ bySession: {} }),
  getters: {
    /**
     * 取某会话的状态切片（无则空白态）。
     *
     * 返回函数而不是直接取值：切片依赖调用方传入的 sessionId，
     * 而 getter 只能在被读取时经调用表达该依赖。
     */
    sessionState(): (sessionId: string | undefined) => TurnrewindSessionState {
      return (sessionId: string | undefined): TurnrewindSessionState =>
        sessionId === undefined ? EMPTY_SESSION_STATE : (this.bySession[sessionId] ?? EMPTY_SESSION_STATE)
    },
  },
  actions: {
    /** 更新某会话状态（merge 语义）。 */
    patch(sessionId: string | undefined, patch: Partial<TurnrewindSessionState>): void {
      if (sessionId === undefined)
        return
      this.bySession[sessionId] = { ...(this.bySession[sessionId] ?? EMPTY_SESSION_STATE), ...patch }
    },
  },
})
