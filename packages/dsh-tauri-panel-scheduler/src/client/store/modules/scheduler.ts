import type { SchedulerUiState } from './scheduler.types'
import { defineStore } from 'dsh-tauri/client'

const READ_AT_KEY = 'dsh.scheduler.readAt'

function readPersisted(): number {
  try {
    const raw = localStorage.getItem(READ_AT_KEY)
    if (raw === null)
      return 0
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  catch {
    return 0
  }
}

function persist(readAt: number): void {
  try {
    localStorage.setItem(READ_AT_KEY, String(readAt))
  }
  catch {
    // 持久化不可用（无 localStorage / 配额）时退化为内存态，本次会话内角标照常工作
  }
}

export const scheduler = defineStore({
  state: (): SchedulerUiState => ({
    tasks: [],
    runs: [],
    options: { workspaces: [], permissions: [], defaultPermission: 'read-only', models: [], failures: [], defaultModel: null },
    loading: false,
    error: '',
    refreshedAt: 0,
    loadToken: 0,
    readAt: readPersisted(),
  }),
  actions: {
    /** 首次载入播种为「此刻已读」：已有历史不再算未读，之后新增的运行才未读。 */
    seedReadAt() {
      if (this.readAt !== 0)
        return
      this.readAt = Date.now()
      persist(this.readAt)
    },
    markAllRunsRead() {
      this.readAt = Date.now()
      persist(this.readAt)
    },
  },
})
