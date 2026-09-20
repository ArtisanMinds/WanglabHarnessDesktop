/**
 * store/modules/session.ts — 每会话摘要缓存（valtio-define 协议）。
 *
 * 状态只放数据与同步迁移；请求与重试记账分别在 `service/` 与 `register/`。
 */

import type { TurnrewindSessionState, TurnrewindUiState } from './session.types'
import { defineStore } from 'dsh-tauri/client'
import { EMPTY_SESSION_STATE } from './session.utils'

export const turnrewind = defineStore({
  state: (): TurnrewindUiState => ({ bySession: {} }),
  actions: {
    /** 更新某会话状态（merge 语义）。 */
    patch(sessionId: string | undefined, patch: Partial<TurnrewindSessionState>): void {
      if (sessionId === undefined)
        return
      this.bySession[sessionId] = { ...(this.bySession[sessionId] ?? EMPTY_SESSION_STATE), ...patch }
    },
  },
})
