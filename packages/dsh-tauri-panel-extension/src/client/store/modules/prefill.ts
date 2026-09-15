/**
 * store/modules/prefill.ts — 技能创建器的待预填会话集合（插件级共享状态）。
 *
 * createSkill 打开新会话前登记会话 id；输入区左侧的 prefill 组件挂载时消费
 * （命中即移除，保证一次性）。状态源集中在这里，读写一律经 actions。
 */

import type { PrefillState } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/** 全局唯一共享状态源（模块级单例）。 */
export const prefill = defineStore({
  state: (): PrefillState => ({ pendingSessionIds: [] }),
  actions: {
    /** 登记一个等待预填草稿的会话（createSkill 打开新会话前调用）。 */
    add(sessionId: string) {
      if (!this.pendingSessionIds.includes(sessionId))
        this.pendingSessionIds.push(sessionId)
    },
    /** 消费该会话的预填资格；命中即移除，返回本次是否命中。 */
    consume(sessionId: string): boolean {
      const at = this.pendingSessionIds.indexOf(sessionId)
      if (at === -1)
        return false
      this.pendingSessionIds.splice(at, 1)
      return true
    },
    /** 清空登记集合（feature 装配与卸载时调用）。 */
    clear() {
      this.pendingSessionIds = []
    },
  },
})
