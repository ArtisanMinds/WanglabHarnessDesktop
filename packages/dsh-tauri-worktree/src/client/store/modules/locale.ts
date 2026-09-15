/**
 * store/modules/locale.ts — locale 变更推进器。
 *
 * 活跃语言本身由 locales/index.ts 的模块级缓存承载（`text()` 同步读取）；
 * 组件要重渲染就必须有一个可订阅的 revision：locale 订阅回调里 `bump()` 一次，
 * `useLocale()` 经 `useStore(store.locale)` 订阅同一份 state。
 */

import { defineStore } from 'dsh-tauri/client'

/** locale revision（递增即通知订阅方重渲染）。 */
export const locale = defineStore({
  state: () => ({ rev: 0 }),
  actions: {
    /** 推进 revision。 */
    bump(): void {
      this.rev += 1
    },
  },
})
