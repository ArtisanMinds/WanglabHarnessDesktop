/**
 * store/index.ts — 扩展面板的客户端状态总入口（valtio-define 协议）。
 *
 * 领域 store 各自一个 `store/modules/<domain>.ts`；本文件只做聚合。
 * 读写约定：外部读 `store.<domain>.<field>`，外部写 `store.<domain>.<action>(...)`；
 * 组件内订阅用 `useStore(store.<domain>)`，非 React 消费方（DOM 补丁 / 控制器 /
 * service）用 `store.<domain>.$subscribe(listener)` / `$subscribeKey` / `$patch` / `$state`。
 */

import { prefill } from './modules/prefill'

export { prefill }

export type { PrefillState } from '../types'

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  prefill,
}
