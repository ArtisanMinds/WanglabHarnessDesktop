import { defineStore } from 'dsh-tauri/client'
import { SETTINGS_ONBOARDING_SLOT, SETTINGS_SECTION_SLOT } from '../../constants'

/**
 * store/modules/slots.ts — 官方槽位注册中心投影的 revision 镜像。
 *
 * 'settings.section' / 'settings.onboarding' 的注册/注销由官方 slots 注册中心
 * 通知（register/sections.ts 在 apply 期订阅，注册中心引用的所有权与清理都留在
 * 那里）；本 store 按槽 key 记 revision，投影 hooks 经 useStore 读取对应 key，
 * 变更即重算导航行。两个被投影的 key 预置为 0，读取路径不存在“缺失键”分支。
 */
export const slots = defineStore({
  state: (): { revisions: Record<string, number> } => ({
    revisions: {
      [SETTINGS_SECTION_SLOT]: 0,
      [SETTINGS_ONBOARDING_SLOT]: 0,
    },
  }),
  actions: {
    /** 推进某个槽 key 的 revision（注册/声明变更通知到达时调用）。 */
    bump(key: string) {
      this.revisions[key] = (this.revisions[key] ?? 0) + 1
    },
  },
})
