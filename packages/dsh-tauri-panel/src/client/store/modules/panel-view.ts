/**
 * store/modules/panel-view.ts — 会话区替换状态（ActionItem active 样式订阅源）。
 *
 * 与壳（`src/store/modules/*`）同款协议：`defineStore({ state, actions })`，
 * state 只放数据、函数放 actions；React 消费方经 `useStore(store.panelView)`
 * 订阅（见 hooks/panel.ts），非 React 消费方经 store/index.ts 的
 * `panelViewStore` 薄包装读写（见 service/controller.tsx）。
 */

import { defineStore } from 'dsh-tauri/client'

/** 当前替换视图 id（null = 官方会话区）。 */
export const panelView = defineStore({
  state: () => ({
    current: null as { id: string } | null,
  }),
  actions: {
    /** 覆写当前替换视图；传 null 归还官方会话区。 */
    setView(view: { id: string } | null) {
      this.current = view
    },
  },
})
