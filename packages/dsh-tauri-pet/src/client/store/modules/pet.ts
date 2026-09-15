import type { PetStatus } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/**
 * store/modules/pet.ts — 桌宠状态缓存（valtio-define 域存储）。
 *
 * 侧栏入口图标是原生 DOM 补丁按钮（非 React 组件），设置页是 settings.section 的
 * React 组件，两者互不感知，因此共享这一份缓存：图标经 `$subscribe` 订阅切换绿点，
 * 设置页经 `useStore(store.pet)` 读写状态。
 */
export const pet = defineStore({
  state: () => ({
    /** 最近一次从桌面端读回的桌宠状态缓存（图标绿点与设置页共用）。 */
    status: null as PetStatus | null,
    /** 状态拉取轮次：只有最新一轮允许写回首屏快照。 */
    fetchRevision: 0,
  }),
  actions: {
    /** 开始一次状态拉取，返回其轮次（旧 `beginPetStatusFetch`）。 */
    beginFetch(): number {
      this.fetchRevision += 1
      return this.fetchRevision
    },
    /**
     * 提交某轮状态拉取：非最新轮次直接丢弃（并发拉取时旧响应不得覆盖新状态）。
     * 注意这里**不**推进轮次——语义与旧实现一致（轮次只由「开始拉取」推进）。
     */
    commitFetch(revision: number, status: PetStatus): boolean {
      if (revision !== this.fetchRevision)
        return false
      this.status = status
      return true
    },
    /** 覆写状态缓存并推进轮次（使在途的旧拉取失效）。 */
    setStatus(status: PetStatus | null): void {
      this.fetchRevision += 1
      this.status = status
    },
  },
})
