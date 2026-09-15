import type { PetStatus } from '../types'
import { locale } from './modules/locale'
import { pet } from './modules/pet'

/**
 * store/index.ts — dsh-tauri-pet 客户端共享状态的统一出口（valtio-define 域存储聚合）。
 *
 * 每个域一份 `modules/<domain>.ts`（state 只放数据、写入走 actions），本文件只做聚合：
 *   - 组件内订阅统一 `useStore(store.<domain>)`；
 *   - 非 React 消费方（DOM 补丁 / service）用 `store.<domain>.$subscribe` / `$state`。
 *
 * 下面三个函数是旧导出名的薄包装（协议文档与既有调用点仍以它们描述「状态拉取轮次」
 * 语义）：只转发到 `store.pet`，自身不持有状态。
 */

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  locale,
  pet,
}

/** 开始一次桌宠状态拉取，返回其轮次（只有最新轮次允许写回首屏快照）。 */
export function beginPetStatusFetch(): number {
  return store.pet.beginFetch()
}

/** 提交某轮状态拉取：非最新轮次返回 false 且不写状态。 */
export function commitPetStatusFetch(revision: number, status: PetStatus): boolean {
  return store.pet.commitFetch(revision, status)
}

/** 写入桌宠状态缓存（并使在途的旧拉取失效）。 */
export function setPetStatus(status: PetStatus | null): void {
  store.pet.setStatus(status)
}
