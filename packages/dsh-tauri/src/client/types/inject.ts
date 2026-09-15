import type { ILayout as UpstreamLayout } from '@deepseek-ai/dsh-client-ui-layout/client'

/**
 * 布局服务面（ctx.layout）。
 *
 * 上游类型随安装的核心版本变化，而仓库 devDependency 解析到的布局包仍是
 * 0.1.0-rc.8（只有 toggleSidebar / openDetails / closeDetails）。0.1.5-rc.1
 * 核心在运行时把 details 换成 rightbar，并新增全局面板选中 `selectPanel`。
 * 因此以上游类型为基座、可选地补上新核心方法，消费方一律能力探测后再调用。
 */
export interface ILayout extends UpstreamLayout {
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

/** 命名空间词典：扁平的「键 → `{name}` 模板串」。 */
export type LocaleDict = Record<string, string>

/** 客户端发运的语言 id（核心 `LOCALE_IDS`）。 */
export type LocaleId = 'zh' | 'en'

/**
 * 翻译函数：`{name}` 占位符由 `params` 补齐，缺值的占位符原样保留（不吞字）。
 * 泛型参数收窄可接受的键集合；不传即任意字符串键（框架注入的 `t` seat 形状）。
 */
export type Translate<K extends string = string> = (key: K, params?: Record<string, unknown>) => string

/** `ctx.locale.getLocale()` 的不可变快照（每次变更换新引用，revision 单调前进）。 */
export interface LocaleSnapshot {
  active: string
  locales: readonly { id: string, label: string }[]
  revision: number
}

/**
 * 本地化服务面（ctx.locale）。
 *
 * 运行时由 `@deepseek-ai/dsh-client-locale` 提供：查找链为「本命名空间活跃语言 →
 * 本命名空间 en → common（活跃 → en）→ 键本身」。上游类型随安装的核心版本漂移，
 * 因此这里只声明插件实际消费的成员，可能缺席的按可选处理（消费方能力探测）。
 */
export interface LocaleService {
  /**
   * 注册命名空间词典：双参形式一次交齐全部语言（推荐——单次 publish 且双语原子登记），
   * 三参形式逐语言注册。返回幂等 disposer。
   */
  register: {
    (namespace: string, dicts: Record<string, LocaleDict>): () => void
    (namespace: string, locale: string, dict: LocaleDict): () => void
  }
  /** 命名空间寻址的翻译函数（同一 ns 返回稳定引用）。 */
  bind?: (namespace: string) => Translate
  /** 当前快照（active / locales / revision）。 */
  getLocale: () => LocaleSnapshot
  /** 快照变更订阅：切换语言与注册/注销词典都会通知。 */
  subscribe: (onChange: () => void) => () => void
  /** 切换活跃语言（唯一写入入口）。 */
  setLocale?: (id: string) => void
}
