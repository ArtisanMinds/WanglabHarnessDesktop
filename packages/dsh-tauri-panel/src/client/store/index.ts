/**
 * store/index.ts — 面板协议的状态层聚合出口（valtio-define，与壳 `src/store/` 同协议）。
 *
 * 每个 `modules/<domain>.ts` 独立自洽，本文件只做聚合：
 *   - 组件一律 `import { store } from '../store'` + `useStore(store.<domain>)`；
 *   - 非 React 消费方（控制器 / service）经 `$subscribe` / `$patch` / 直接写字段取用，
 *     或走下方保留的旧名薄包装。
 */

import { panelList } from './modules/panel-list'
import { panelView } from './modules/panel-view'

/** 全局 store 聚合（模块各自独立，聚合统一出口）。 */
export const store = {
  panelView,
  panelList,
}

/**
 * 兼容旧导出名的薄包装（协议文档与既有非 React 调用点仍以 `panelViewStore` 称呼这份
 * 会话区替换状态）：只转发到 `store.panelView`，自身不持有状态。
 */
export const panelViewStore = {
  /** 当前替换视图（null = 官方会话区）。 */
  getSnapshot: (): { id: string } | null => store.panelView.current,
  /** 覆写当前替换视图。 */
  set: (view: { id: string } | null): void => store.panelView.setView(view),
}
