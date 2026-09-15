/**
 * client/store/index.ts — 客户端状态总入口（valtio-define 协议）。
 *
 * 领域 store 各自一个 `store/modules/<domain>.ts`；本文件只做聚合，并保留迁移前的
 * 公开读写入口（`ensureSummary` / `retrySummaryForTurn` / `requestUndo` /
 * `selectSessionState` / `useTurnrewindSession`）为薄封装，调用点无需改动。
 *
 * 读写约定（spec §3）：外部读 `store.<domain>.<field>`，外部写
 * `store.<domain>.<field> = v` 或 `store.<domain>.<action>(...)`；
 * 组件内订阅用 `useStore(store.<domain>)`。
 *
 * 在飞请求按会话合并放在这里（而不是放进 state）：它是编排关注点而非界面数据，
 * 同一会话的多个 turn 卡片因此只会打同一份摘要。
 */

import type { SessionSummary, TurnrewindSessionState } from '../types'
import { useStore } from 'dsh-tauri/client'
import { getSummary, postUndo } from '../apis'
import { locale } from './modules/locale'
import { EMPTY_SESSION_STATE, turnrewind } from './modules/session'

export { locale, turnrewind }
export type { SessionSummary, TurnrewindSessionState, TurnrewindUiState } from '../types'

/** 插件共享状态（模块级单例；插件重载时随 bundle 重建，可接受）。 */
export const store = {
  turnrewind,
  locale,
}

/**
 * 一次状态写入：合并切片字段，或替换撤销反馈。
 *
 * 只在运行时读取 `kind`，因此这里刻意用**判别联合**而不是 `Partial`：`Partial` 会让
 * `{ kind: 'undo', undoing: true }` 漏掉 `undoConflicts` 也通过类型检查，而撤销反馈
 * 的三件套（`undoing` / `undoError` / `undoConflicts`）必须整组写入才不会留下脏状态。
 */
type SessionWrite
  = | { kind: 'merge', patch: Partial<TurnrewindSessionState> }
    | { kind: 'undo', undoing: boolean, undoError: string | null, undoConflicts: Array<{ path: string, reason: string }> }

/**
 * 取某会话的状态切片（无则空白态，引用稳定）。
 *
 * 签名对状态容器**结构开放**：既接受 valtio 的 `$state`（深只读代理），
 * 也接受可变引用；返回类型只保留切片字段，因此调用方不需要 `as` 断言。
 */
export function selectSessionState<C extends { bySession: Record<string, unknown> }>(state: C, sessionId: string | undefined): TurnrewindSessionState {
  if (sessionId === undefined)
    return EMPTY_SESSION_STATE
  return (state.bySession[sessionId] as TurnrewindSessionState | undefined) ?? EMPTY_SESSION_STATE
}

/** 更新某会话状态（merge 语义）。 */
function writeSession(sessionId: string | undefined, write: SessionWrite): void {
  if (sessionId === undefined)
    return
  const patch = write.kind === 'merge'
    ? write.patch
    : { undoing: write.undoing, undoError: write.undoError, undoConflicts: write.undoConflicts }
  store.turnrewind.patch(sessionId, patch)
}

/** 更新某会话状态（merge 语义；保留迁移前的公开名字）。 */
export function patchSession(sessionId: string | undefined, patch: Partial<TurnrewindSessionState>): void {
  writeSession(sessionId, { kind: 'merge', patch })
}

/**
 * 组件内订阅某会话状态。
 *
 * `useStore` 返回的是**深只读**快照；本包的公开面沿用迁移前的 `TurnrewindSessionState`
 * （组件只读它，从不在拿到切片后写回——写入一律走 `patchSession` / `requestUndo`，
 * 而它们操作的是 store 代理而非快照）。因此这里把快照收敛回切片类型，
 * 与旧的 `useSyncExternalStore(getSnapshot)` 口径一致，避免整个 format/组件链
 * 被深只读类型污染。
 */
export function useTurnrewindSession(sessionId: string | undefined): TurnrewindSessionState {
  const { bySession } = useStore(store.turnrewind)
  return (bySession[sessionId ?? ''] ?? EMPTY_SESSION_STATE) as unknown as TurnrewindSessionState
}

/** 在飞摘要请求（按会话合并；force 时另起一次）。 */
const inflight = new Map<string, Promise<void>>()

/** 错误归一：`Error` 取 message，其余 `String()`（含 h3 的响应体错误）。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 拉取（或强制刷新）某会话摘要。
 * @param sessionId - 会话 id。
 * @param force - true 时忽略已有缓存与在飞请求，强制重拉。
 */
export function ensureSummary(sessionId: string | undefined, force = false): Promise<void> {
  if (sessionId === undefined)
    return Promise.resolve()
  const current = selectSessionState(store.turnrewind.$state, sessionId)
  if (!force && (current.status === 'ready' || current.status === 'loading'))
    return inflight.get(sessionId) ?? Promise.resolve()
  const existing = inflight.get(sessionId)
  if (existing !== undefined && !force)
    return existing
  const task = (async (): Promise<void> => {
    patchSession(sessionId, { status: 'loading', error: null })
    try {
      const summary: SessionSummary = await getSummary(sessionId)
      patchSession(sessionId, { status: 'ready', summary, error: null })
    }
    catch (error) {
      patchSession(sessionId, { status: 'error', error: messageOf(error) })
    }
    finally {
      inflight.delete(sessionId)
    }
  })()
  inflight.set(sessionId, task)
  return task
}

/**
 * 「本轮已结束但账本暂无记录」的重试：累计该 turn 的重试次数后强制重拉。
 * after 快照在 turn/end 之后后台结算，卡片可能先于账本落地渲染。
 */
export function retrySummaryForTurn(sessionId: string | undefined, turn: number): Promise<void> {
  if (sessionId === undefined)
    return Promise.resolve()
  const current = selectSessionState(store.turnrewind.$state, sessionId)
  patchSession(sessionId, { attempts: { ...current.attempts, [turn]: (current.attempts[turn] ?? 0) + 1 } })
  return ensureSummary(sessionId, true)
}

/**
 * 撤销某 turn 的文件改动。
 * 成功 → 强制刷新摘要（卡片转为「已撤销」）；409 → 展示冲突清单；其它 → 展示错误。
 * @returns 是否成功。
 */
export async function requestUndo(sessionId: string | undefined, turn: number): Promise<boolean> {
  if (sessionId === undefined)
    return false
  writeSession(sessionId, { kind: 'undo', undoing: true, undoError: null, undoConflicts: [] })
  try {
    const { status, data } = await postUndo({ sessionId, turn })
    if (status >= 200 && status < 300 && data.ok !== false) {
      writeSession(sessionId, { kind: 'undo', undoing: false, undoError: null, undoConflicts: [] })
      await ensureSummary(sessionId, true)
      return true
    }
    writeSession(sessionId, {
      kind: 'undo',
      undoing: false,
      undoError: data.error ?? `HTTP ${status}`,
      undoConflicts: data.conflicts ?? [],
    })
    return false
  }
  catch (error) {
    writeSession(sessionId, { kind: 'undo', undoing: false, undoError: messageOf(error), undoConflicts: [] })
    return false
  }
}

export { EMPTY_SESSION_STATE } from './modules/session'
