/**
 * store/modules/archive.ts — 归档页面的共享状态（archived 载荷 + 页面筛选状态）。
 *
 * 每个归档会话的业务字段（标题、更新时间、工作区组）由组件合并
 * ctx.sessions / ctx.workspaces 的运行时快照得到，这里不复制那份数据。
 *
 * 变更编排（unarchive/delete/clear → 刷新 + resync）、错误归一与并发代际
 * 在 service/archive.ts；本文件只保留状态源与页面 setter（写入口收敛为 actions）。
 */

import type { ArchiveSort, ArchiveUiState } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/** 全局唯一共享状态源（模块级单例）。 */
export const archive = defineStore({
  state: (): ArchiveUiState => ({
    archived: { archivedSessionIds: [], meta: {} },
    sort: 'updatedAt',
    query: '',
    workspaceId: 'all',
    loading: false,
    pending: false,
    error: '',
    suppressedSessionIds: [],
    titleById: {},
  }),
  actions: {
    /** 归档页排序方式（更新时间 / 创建时间 / 标题）。 */
    setSort(sort: ArchiveSort) {
      this.sort = sort
    },
    /** 归档页搜索关键字。 */
    setQuery(query: string) {
      this.query = query
    },
    /** 归档页项目筛选（'all' 显示全部组）。 */
    setWorkspaceFilter(workspaceId: string) {
      this.workspaceId = workspaceId
    },
  },
})
