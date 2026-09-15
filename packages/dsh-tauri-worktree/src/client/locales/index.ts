/**
 * locale.ts — 本插件自有的界面文案（模式选择 / Surface 提示 / 检出 / 放弃 / 处理状态）。
 *
 * 用 locale 服务的**非类型化**注册面（register(ns, locale, dict)）挂进 dsh 的 locale
 * 表：zh/en 双语齐全即满足运行时“bilingual balance”约束，无需增广 LocaleNamespaceMap。
 * 组件侧不引入框架 `t` 座，改用一个极薄的桥：apply 时订阅 locale 变更推进
 * `store.locale` 的 rev，组件经 `useStore(store.locale)` 订阅 rev 重渲染，
 * 文案按当前 active locale 从本地字典读取。
 */
import type { ClientContext } from 'dsh-tauri/client'
import type { LocaleKey } from '../types'
import { useStore } from 'dsh-tauri/client'
import { WORKTREE_LOCALE_NAMESPACE as NS } from '../constants'
import { store } from '../store'

export { WORKTREE_LOCALE_NAMESPACE as NS } from '../constants'
export type { LocaleKey } from '../types'

/** zh 字典（键集合的权威）。 */
const DICT_ZH = {
  modeLabel: '工作模式',
  modeLocal: '本地',
  modeWorktree: '工作树',
  modeNewWorktree: '新建工作树',
  modeWorktreeDesc: '发送下一条消息时新建隔离 Git 工作树',
  modeLocalDesc: '在当前本地工作区处理',
  surfaceWorktree: '该会话正在工作树进行',
  surfaceCheckout: '检出本地',
  surfaceAbandon: '放弃',
  checkoutTitle: '将更改带回本地检出并继续',
  checkoutBranchLabel: '本地检出分支名',
  checkoutCurrentPath: '关联路径',
  checkoutTargetPath: '项目路径',
  checkoutConfirm: '确认检出',
  checkoutCancel: '取消',
  abandonTitle: '放弃工作树更改',
  abandonBody: '确认放弃吗？这将归档当前会话及删除对应的临时工作树。',
  abandonConfirm: '确认放弃',
  abandonCancel: '取消',
  progressCreating: '正在准备工作树',
  progressCheckingOut: '正在检出文件',
  progressCreated: '已创建工作树',
  progressViewLogs: '日志',
  progressThinking: '正在思考…',
  progressError: '工作树处理失败',
  progressDeleting: '正在删除工作树',
  branchPlaceholder: 'dsh/feature-xyz',
  logEmpty: '暂无创建日志',
  sessionWorkingTreeBadge: '工作树',
} as const satisfies Record<LocaleKey, string>

/** en 字典，与 zh 键集完全一致（locale 运行时强制双语平衡）。 */
const DICT_EN: Record<LocaleKey, string> = {
  modeLabel: 'Mode',
  modeLocal: 'Local',
  modeWorktree: 'Worktree',
  modeNewWorktree: 'New worktree',
  modeWorktreeDesc: 'Create an isolated Git worktree when the next message is sent',
  modeLocalDesc: 'Process in the current local workspace',
  surfaceWorktree: 'This session is running in a worktree',
  surfaceCheckout: 'Checkout local',
  surfaceAbandon: 'Abandon',
  checkoutTitle: 'Bring changes back to local and continue',
  checkoutBranchLabel: 'Local checkout branch name',
  checkoutCurrentPath: 'Current path',
  checkoutTargetPath: 'Target project path',
  checkoutConfirm: 'Confirm checkout & merge',
  checkoutCancel: 'Cancel',
  abandonTitle: 'Abandon worktree changes',
  abandonBody: 'Are you sure? This will archive this session and delete its temporary worktree.',
  abandonConfirm: 'Confirm abandon',
  abandonCancel: 'Cancel',
  progressCreating: 'Preparing workspace',
  progressCheckingOut: 'Checking out files',
  progressCreated: 'Workspace created',
  progressViewLogs: 'Logs',
  progressThinking: 'Thinking…',
  progressError: 'Worktree processing failed',
  progressDeleting: 'Deleting worktree',
  branchPlaceholder: 'dsh/feature-xyz',
  logEmpty: 'No creation log yet',
  sessionWorkingTreeBadge: 'Worktree',
}

/** 活跃语言 id（module 级缓存，apply 时初始化并由订阅推进）。 */
let activeLocale = 'en'

/**
 * 在 apply 里安装：注册本插件的双语字典，并桥接 locale 变更到 `store.locale` 的 revision。
 * @param ctx - 客户端根上下文（须已注入 locale 服务）。
 * @returns 卸载函数：注销订阅与两份字典注册句柄（由 controller / effect 托管）。
 */
export function registerLocale(ctx: ClientContext): () => void {
  activeLocale = ctx.locale.getLocale().active
  const unregisterZh = ctx.locale.register(NS, 'zh', DICT_ZH)
  const unregisterEn = ctx.locale.register(NS, 'en', DICT_EN)
  const unsubscribe = ctx.locale.subscribe(() => {
    activeLocale = ctx.locale.getLocale().active
    store.locale.bump()
  })
  return () => {
    unsubscribe()
    unregisterEn()
    unregisterZh()
  }
}

/** 按当前活跃语言取一条文案。 */
export function text(key: LocaleKey): string {
  return activeLocale === 'en' ? DICT_EN[key] : DICT_ZH[key]
}

/** 组件内订阅 locale 变更（revision 前进即重渲染）。 */
export function useLocale(): void {
  useStore(store.locale)
}
