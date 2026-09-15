/**
 * store/modules/scheduler.ts — 调度器面板的共享状态（任务列表 + 执行记录 + 对话框选项）。
 *
 * 每个面板/子组件都从这里读同一份状态；刷新代际、动作编排与错误归一在
 * service/scheduler.ts，本文件只保留状态源（data only，无副作用）。
 *
 * 写入口（spec §3）：React 外读 `store.scheduler.<field>`，写
 * `store.scheduler.$patch({...})`；组件内订阅 `useStore(store.scheduler)`。
 */

import type { RunView, SchedulerOptions, TaskView } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/** 面板 UI 状态。 */
export interface SchedulerUiState {
  tasks: TaskView[]
  runs: RunView[]
  options: SchedulerOptions
  loading: boolean
  error: string
  refreshedAt: number
}

/** 初始状态。 */
export function blankUiState(): SchedulerUiState {
  return {
    tasks: [],
    runs: [],
    options: { workspaces: [], permissions: [], defaultPermission: 'read-only', models: [], failures: [], defaultModel: null },
    loading: false,
    error: '',
    refreshedAt: 0,
  }
}

/** 全局唯一共享状态源（模块级单例）。 */
export const scheduler = defineStore({
  state: (): SchedulerUiState => blankUiState(),
})
