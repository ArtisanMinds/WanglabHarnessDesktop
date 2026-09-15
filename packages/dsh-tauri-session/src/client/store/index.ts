/**
 * store/index.ts — 归档插件的客户端状态总入口（valtio-define 协议）。
 *
 * 领域 store 各自一个 `store/modules/<domain>.ts`；本文件只做聚合，并保留
 * 迁移前的公开读写入口（`setSort` / `setQuery` / `setWorkspaceFilter` /
 * `useArchiveUi`）为薄封装，调用点无需改动。
 *
 * 读写约定（spec §3）：外部读 `store.<domain>.<field>`，外部写
 * `store.<domain>.<field> = v` 或 `store.<domain>.<action>(...)`；
 * 组件内订阅用 `useStore(store.<domain>)`。
 */

import type { ArchiveSort } from '../types'
import { useStore } from 'dsh-tauri/client'
import { archive } from './modules/archive'
import { locale } from './modules/locale'

export { archive, locale }

export type { ArchivedListPayload, ArchiveUiState } from '../types'

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  archive,
  locale,
}

/**
 * 组件内订阅归档 UI 状态。
 *
 * 返回 `useStore(store.archive)` 的深度只读快照（`Snapshot<ArchiveUiState>`），
 * 故此处不展开标注 `ArchiveUiState` —— 那会把只读数组错误地标成可变数组。
 */
export function useArchiveUi() {
  return useStore(store.archive)
}

/** 归档页排序方式（更新时间 / 创建时间 / 标题）。 */
export function setSort(sort: ArchiveSort): void {
  store.archive.setSort(sort)
}

/** 归档页搜索关键字。 */
export function setQuery(query: string): void {
  store.archive.setQuery(query)
}

/** 归档页项目筛选（'all' 显示全部组）。 */
export function setWorkspaceFilter(workspaceId: string): void {
  store.archive.setWorkspaceFilter(workspaceId)
}
