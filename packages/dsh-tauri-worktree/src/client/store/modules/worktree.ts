/**
 * store/modules/worktree.ts — 按会话缓存的工作树状态源（valtio-define 协议）。
 *
 * 桌面壳四个注册条目（mode select / surface / dialog / session icons）是同一插件的多个
 * 独立槽位，凭这一份模块级 store 共享按会话的工作树状态。状态只放数据（`bySession` 切片），
 * 写入口收敛为 `patch` action；变更动作（检出/放弃 + job 轮询）在 service/actions.ts，
 * 自动交接编排在 service/handoff.ts。
 */

import type { WorktreeSessionState, WorktreeUiState } from '../../types'
import { defineStore } from 'dsh-tauri/client'
import { preferences } from './preferences'

/** 无绑定会话的初始状态。 */
export function blankState(): WorktreeSessionState {
  return {
    mode: preferences.preferredMode,
    // 未知 git 状态时默认按 git 仓库处理（工作树插件的目标用户），待 status 返回后校准。
    isGit: true,
    phase: 'idle',
    loadingLabel: '',
    log: [],
    worktreeKey: '',
    worktreePath: '',
    projectPath: '',
    sourceSessionId: '',
    branchName: 'dsh/',
    checkoutOpen: false,
    abandonOpen: false,
    error: '',
  }
}

/**
 * 缺席会话的空白态。
 *
 * 引用必须稳定（模块级常量）：读缺席会话时每次都返回同一个对象，
 * 订阅方才不会因为「每次读到新对象」而无休止重渲染。
 */
export const EMPTY_STATE: WorktreeSessionState = blankState()

/** 按会话缓存的工作树状态源（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const worktree = defineStore({
  state: (): WorktreeUiState => ({ bySession: {} }),
  actions: {
    /** 更新某会话的 state（merge 语义；无则从当前偏好的空白态起步）。 */
    patch(sessionId: string | undefined, patch: Partial<WorktreeSessionState>): void {
      if (sessionId === undefined)
        return
      this.bySession[sessionId] = { ...(this.bySession[sessionId] ?? blankState()), ...patch }
    },
  },
})
