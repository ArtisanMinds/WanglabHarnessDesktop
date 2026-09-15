import type { SettingsUiState } from '../../types'
import { defineStore } from 'dsh-tauri/client'

/**
 * store/modules/settings.ts — 设置侧边栏的共享 UI 状态（valtio-define 域存储）。
 *
 * 触发器（sidebar.settings 槽内）与侧边栏（shell.overlay 槽内）是同一插件
 * 的两个独立注册条目，凭一个模块级 store 共享开关/当前分区/搜索词：
 *   - 触发器把 open 置 true（并可选跳到某分区）；
 *   - 侧边栏订阅 open/activeId/query 渲染，Esc 或“返回应用”置 false。
 *
 * state 只放数据，写入一律走 actions（`this` 即 state 代理）。
 * 左栏宽度合约与官方 sidebar 面板一致：
 * defineStore init sidebar:280，setSidebar clamp clampWidth(px, 264, 420)，关闭即忘
 * （官方“closing a panel forgets its drag width”——不持久化，重开回默认）。
 */
export const settings = defineStore({
  state: (): SettingsUiState => ({
    open: false,
    activeId: undefined,
    query: '',
    railWidth: undefined,
  }),
  actions: {
    /** 打开侧边栏；可选直接跳到一个设置分区（onboarding 的 openSection 用）。 */
    openAt(sectionId?: string) {
      this.open = true
      if (sectionId !== undefined)
        this.activeId = sectionId
    },
    /** 关闭侧边栏并复位视图状态（与官方 close 的复位语义一致；宽度也即忘）。 */
    close() {
      this.open = false
      this.activeId = undefined
      this.query = ''
      this.railWidth = undefined
    },
    /** 切换左栏当前分区。 */
    select(id: string) {
      this.activeId = id
    },
    /** 写入搜索词（侧边栏搜索框的受控值）。 */
    setQuery(query: string) {
      this.query = query
    },
    /** 拖拽中实时写入左栏宽度（调用方已按合约钳制）。 */
    setRailWidth(px: number) {
      this.railWidth = px
    },
  },
})
