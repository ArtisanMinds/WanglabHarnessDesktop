/**
 * store/modules/panel-list.ts — 官方 `sidebar.panellist` 的行投影快照。
 *
 * 官方 ui-sidebar 在它的 apply() 里维护同一份投影（内部 `syncPanels`）：
 * 读 `entriesOfSlot('sidebar.panellist')` → `{ id, order, label }` → 按 order 升序。
 * 本插件以 priority -1 shadow 了官方 `sidebar` 条目，克隆侧栏**必须自己复刻这份
 * 投影**，否则按官方协议注册的面板会「注册成功、没有任何入口」（静默失效）。
 *
 * 投影的写入在 `service/panel-list.ts`（结构比较后写入，未变即不写）；
 * 本模块只声明状态与写入口，React 消费方用 `useStore(store.panelList)` 订阅 `rows`。
 */

import type { PanelListEntry } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/** 面板清单行投影（`main` 槽每个 key 一行入口）。 */
export const panelList = defineStore({
  state: () => ({
    rows: [] as PanelListEntry[],
  }),
  actions: {
    /**
     * 覆写行快照。
     *
     * **调用前必须做结构比较**（`entriesOfSlot` 每次返回新数组且「未声明时为空表」）：
     * 逐字段相等时不要调用本方法，否则订阅方每帧都判定快照变化。
     */
    setRows(rows: PanelListEntry[]) {
      this.rows = rows
    },
  },
})
