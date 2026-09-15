/**
 * hooks/panel.ts — 面板协议相关 React hooks。
 */

import { useStore } from 'dsh-tauri/client'
import { store } from '../store'

/** 订阅当前替换 id（null = 官方会话区）。 */
export function usePanelViewId(): { id: string } | null {
  return useStore(store.panelView).current
}
