/**
 * host/storage.ts — 旧版（v1）自持归档的持久化（新机制由宿主 WorkspaceRegistry
 * 持有归档集合；本文件只在启动迁移时读写旧 `archive.json`）。
 *
 * 只暴露模块级 `storage` 单例（archive 功能目录 → `$DSH_HOME/archive`）；
 * 读改写逻辑在 host/service/archive.ts（直接 storage.getItem / storage.setItem）。
 */

import { fsAtomicDriver } from 'dsh-tauri'
// 宿主侧允许直接依赖 unstorage（tmp+rename 原子写由 fsAtomicDriver 承担）。
import { createStorage } from 'unstorage'

/** archive 功能目录存储（`$DSH_HOME/archive`；key 如 `archive.json`）。 */
export const storage = createStorage({ driver: fsAtomicDriver({ base: 'archive' }) })
