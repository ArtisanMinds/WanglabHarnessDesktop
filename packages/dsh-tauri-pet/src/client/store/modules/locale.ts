import { defineStore } from 'dsh-tauri/client'

/**
 * store/modules/locale.ts — 桌宠双语文案的活跃语言快照（valtio-define 域存储）。
 *
 * locale 服务是外部事件源：apply 时（register/locale.ts）订阅它，变更到达即
 * `setActive()`；组件经 `useStore(store.locale)` 订阅 rev，前进即重渲染并按当前
 * locale 重读本地字典。这样组件侧不需要自造 uSES 订阅器。
 */
export const locale = defineStore({
  state: () => ({
    /** 当前活跃语言标签（如 `zh-CN` / `en-US`）。 */
    active: 'en',
    /** 语言变更轮次（订阅方据此重渲染）。 */
    rev: 0,
  }),
  actions: {
    /** 记录当前活跃语言并推进 revision。 */
    setActive(active: string): void {
      this.active = active
      this.rev += 1
    },
  },
})
