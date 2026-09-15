/**
 * store/modules/preferences.ts — 新会话工作模式偏好（local / pending）。
 *
 * 偏好经 dsh-tauri/client 的 `createStorage` + `localStorageDriver` 持久化（unstorage 的
 * localStorage driver，base 由 driver 拼 `base:` 前缀防串扰，兼容旧 key）。插件 client 不直接
 * import unstorage，一律经 dsh-tauri/client。
 *
 * state 只放数据、函数放 actions（spec §3）：`hydrate` 是 apply 时的一次性异步读回，
 * `remember` 写内存并顺带落盘（存储不可用不影响会话功能）。
 */

import { createStorage, defineStore, localStorageDriver } from 'dsh-tauri/client'
import { WORKTREE_PLUGIN_NAME } from '../../../shared/constants'

/** 新会话沿用的工作模式：本地 / 下一条消息新建工作树。 */
export type WorktreeNewSessionMode = 'local' | 'pending'

/** 插件范围内 key-value 存储（localStorage driver）。 */
const storage = createStorage({ driver: localStorageDriver({ base: WORKTREE_PLUGIN_NAME }) })

const PREFERRED_MODE_KEY = 'preferred-mode'

/** 新会话偏好 store（模块级单例）。 */
export const preferences = defineStore({
  state: () => ({
    /** 用户最近一次选择；未被 hydrate 前保持官方默认「本地」。 */
    preferredMode: 'local' as WorktreeNewSessionMode,
    /** hydrate 是否已执行（只读回一次）。 */
    hydrated: false,
  }),
  actions: {
    /** apply 时调用一次：异步读回用户上次选择（失败保持默认）。 */
    async hydrate(): Promise<void> {
      if (this.hydrated)
        return
      this.hydrated = true
      try {
        this.preferredMode = (await storage.getItem(PREFERRED_MODE_KEY)) === 'pending' ? 'pending' : 'local'
      }
      catch {
        /* 存储不可用（隐私模式等）不影响会话功能 */
      }
    },
    /** 记住用户本次选择（写内存 + 落盘）。 */
    remember(mode: WorktreeNewSessionMode): void {
      this.preferredMode = mode
      void storage.setItem(PREFERRED_MODE_KEY, mode).catch(() => {})
    },
  },
})
