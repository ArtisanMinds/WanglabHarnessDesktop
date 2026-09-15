import { defineStore } from 'dsh-tauri/client'

/**
 * store/modules/locale.ts — 活跃语言变更的 revision 推进器（valtio-define 域存储）。
 *
 * locale 服务是外部事件源：apply 时（registerSettingsLocale）订阅它，变更到达即
 * bump()；组件经 useStore(store.locale) 订阅 rev，前进即重渲染并按当前 locale
 * 重读本地字典。这样组件侧不需要自造 uSES 订阅器。
 */
export const locale = defineStore({
  state: () => ({ rev: 0 }),
  actions: {
    /** 推进 revision（订阅方随之重渲染）。 */
    bump() {
      this.rev++
    },
  },
})
