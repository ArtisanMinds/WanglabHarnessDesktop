import type { ILayout as UpstreamLayout } from '@deepseek-ai/dsh-client-ui-layout/client'

/**
 * 布局服务面（ctx.layout）。
 *
 * 以配套核心类型为基座，把跨版本导航接口收敛为可选能力。0.1.5-rc.1
 * 把 details 换成 rightbar 并新增 selectPanel；旧接口只用于旧核心回退。
 * 消费方一律能力探测后调用，不能把旧版本的必选声明套到当前核心。
 */
export interface ILayout extends Omit<UpstreamLayout, 'selectPanel' | 'openRightbar' | 'closeRightbar' | 'openDetails' | 'closeDetails'> {
  openDetails?: () => void
  closeDetails?: () => void
  /**
   * ≥0.1.5-rc.1：按 `main` 槽的 key 选中全局面板，`null` 回到会话（不切换 Session）。
   * 传入未注册的 id 会上游抛错，调用前需自查 `main` 的 key 集合。
   */
  selectPanel?: (panelId: string | null) => void
  /** ≥0.1.5-rc.1：报告右侧栏是否占 track 以及是否全屏（取代 openDetails）。 */
  openRightbar?: (track: boolean, fullscreen: boolean) => void
  /** ≥0.1.5-rc.1：报告右侧栏隐藏（无 track、无手柄）。 */
  closeRightbar?: () => void
}

export interface LocaleService {
  register: (namespace: string, locale: string, dict: Record<string, unknown>) => () => void
  getLocale: () => { active: string }
  subscribe: (onChange: () => void) => () => void
}
