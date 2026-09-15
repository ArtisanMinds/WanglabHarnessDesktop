/**
 * store/index.ts — 调度器客户端状态总入口（valtio-define 协议）。
 *
 * 领域 store 各自一个 `store/modules/<domain>.ts`；本文件只做聚合，并保留
 * 迁移前的公开读写入口（`blankUiState` / `selectSchedulerState` /
 * `useSchedulerState`）为薄封装，调用点无需改动。
 *
 * 读写约定（spec §3）：外部读 `store.scheduler.<field>`，外部写
 * `store.scheduler.$patch({...})`；组件内订阅用 `useStore(store.scheduler)`。
 */

import { useStore } from 'dsh-tauri/client'
import { blankUiState, scheduler } from './modules/scheduler'

export { blankUiState, scheduler }
export type { SchedulerUiState } from './modules/scheduler'

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  scheduler,
}

/** 取当前状态快照（非 React 消费方使用）。 */
export function selectSchedulerState() {
  return store.scheduler.$state
}

/**
 * 组件内订阅调度器状态。
 *
 * 返回 `useStore(store.scheduler)` 的深度只读快照（`Snapshot<SchedulerUiState>`），
 * 故此处不展开标注 `SchedulerUiState` —— 那会把只读字段错误地标成可变。
 */
export function useSchedulerState() {
  return useStore(store.scheduler)
}
