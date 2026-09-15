/**
 * host/storage/index.ts — 扩展面板持久化存储入口（skills 功能目录）。
 *
 * 只暴露模块级 `storage` 单例；skill root 的读取/变更在 host/service/skill-root.ts
 * 实现，不在此写包装。
 */

import { DSH_HOME, fsAtomicDriver } from 'dsh-tauri'
import { join } from 'pathe'
import { createStorage } from 'unstorage'

/**
 * skills 功能目录存储（`$DSH_HOME/skills`；key 如 `state.json`）。
 *
 * base 必须是**绝对路径**：`fsAtomicDriver` 会把相对 base 拼到 dsh-tauri 内部的
 * `DSH_HOME` 上，那样 `vi.mock('dsh-tauri')` 换掉数据根时驱动仍会写真实目录。
 */
export const storage = createStorage({ driver: fsAtomicDriver({ base: join(DSH_HOME, 'skills') }) })
