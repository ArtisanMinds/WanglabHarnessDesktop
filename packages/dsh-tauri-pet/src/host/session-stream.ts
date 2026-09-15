/**
 * host/session-stream.ts — 桌宠会话增量投影：订阅宿主会话总线，经 reducer 投影成
 * 桌宠展示态后广播给所有已接入的 SSE 消费者。
 *
 * 消费模型（性能约定）：**没有消费者就没有监听**。桌宠停用/隐藏后 Rust 会主动断开
 * 订阅（`sync_pet_session_stream`），宿主侧最后一个消费者断开时注销 `session/event` +
 * `session/disposed` + `agent/status` 并丢弃累计态；下次有消费者接入再挂载。
 *
 * 分工：本模块只管「宿主会话总线 → 展示态帧」；HTTP/SSE 细节（`EventStream`、心跳、
 * 断连清理）留在 `routes/session-stream/get.ts`，两者只通过 `SessionStreamSink`
 * （只收「一帧 JSON 载荷」这一具体参数）交互。
 *
 * 本模块是薄的适配层：把「宿主 session 到底有什么字段」这个无法在单测里验证的
 * 不确定性隔离在 `peerOf()` 一处（其余逻辑见 reducer.ts 的单测）。
 */
import type { HostContext } from 'dsh-tauri'
import type { PetSessionEvent, PetSessionPayload, PetSessionPeer } from './reducer'
import { createPetSessionReducer } from './reducer'

/**
 * 单个 SSE 消费者。
 *
 * 只暴露「推一帧 data 载荷」与「结束连接」两个动作：不接触 h3 事件、响应对象或
 * 请求体，因此会话总线的逻辑可以脱离 HTTP 单测。
 */
export interface SessionStreamSink {
  /** 推送一帧 `data:` 载荷（JSON 字符串）。 */
  push: (frame: string) => void
  /** 主动结束该连接（插件卸载时的收尾，等价旧实现的 `response.end()`）。 */
  close: () => void
}

/** 已接入的 SSE 消费者（断连即移除）。 */
const sinks = new Set<SessionStreamSink>()

/** 会话出生：首次出现的 id 推 create，随后交由 `handleSessionEvent` 推增量 update。 */
const known = new Set<string>()

/** 会话事件监听的注销句柄；undefined = 当前无消费者、未挂载。 */
let disposeSessionEvents: (() => void) | undefined

/** 会话标题折叠源：宿主 `sessionTitle` 服务（`session/title` 事件）。可选 —— 未挂载时回退 id。 */
interface TitleServiceLike {
  get?: (session: unknown) => { title?: string } | undefined
}

/** 投影注册表：`@deepseek-ai/dsh-session-title` 注册了 key='title' 的投影单元。 */
interface ProjectionRegistryLike {
  stateOf?: (session: unknown, key: string) => unknown
}

/** 接入期解析出的宿主服务面（无消费者时清空，避免跨插件实例残留）。 */
let host: HostContext | undefined
let titleService: TitleServiceLike | undefined
let projections: ProjectionRegistryLike | undefined

/** 从宿主 session / 事件读取会话 id（`peerOf` 复用，避免为取 id 重复推导整份 peer）。 */
function sessionIdOf(session: unknown, event: PetSessionEvent): string {
  const s = session as { id?: unknown, sessionId?: unknown } | undefined
  if (typeof s?.id === 'string')
    return s.id
  if (typeof s?.sessionId === 'string')
    return s.sessionId
  return String(event.data?.sessionId ?? '')
}

/**
 * 从宿主 session 对象读取的最小身份字段（运行时形状在此解耦，字段缺失即 undefined）。
 * 标题从宿主 `sessionTitle` 服务（`session/title` 事件折叠）读取 —— 裸 Session 类没有 title。
 *
 * `foldTitle` 只在**会话首次出现**时传入：`sessionTitle.get()` 内部是
 * `foldSessionTitle(session.snapshotEvents())`，而 `snapshotEvents()` 会整份复制
 * 会话事件日志（37k 事件 ≈ 288 KiB/次）再 `findLast` 扫描一遍 —— O(事件总数)。
 * 若在每次 `session/event`（含逐 token 的 assistant/chunk）都调用，宿主进程每 token
 * 都要付 1–4 ms CPU 与数百 KiB 垃圾，直接拖慢同进程的流式转发。后续标题变化由
 * reducer 的 `session/title` 分支增量带入，无需重复全量折叠。
 */
function peerOf(
  session: unknown,
  event: PetSessionEvent,
  foldTitle?: (session: unknown) => string | undefined,
): PetSessionPeer {
  const s = session as {
    id?: unknown
    sessionId?: unknown
    header?: { origin?: 'subagent', cwd?: string }
    summary?: {
      origin?: 'subagent'
      title?: string
      displayTitle?: string
      cwd?: string
      running?: boolean
    }
    title?: string
    displayTitle?: string
    cwd?: string
    running?: boolean
  } | undefined
  const id = sessionIdOf(session, event)
  const header = s?.header
  const summary = s?.summary
  const foldedTitle = foldTitle?.(session)
  const title = summary?.title ?? s?.title ?? foldedTitle
  return {
    id,
    origin: summary?.origin ?? header?.origin,
    title,
    displayTitle: summary?.displayTitle ?? s?.displayTitle ?? foldedTitle,
    cwd: summary?.cwd ?? header?.cwd ?? s?.cwd,
    running: typeof summary?.running === 'boolean' ? summary.running : s?.running,
  }
}

/** 把 bus 广播的事件归一化到 reducer 契约（丢弃无 data 载荷的 log-only 噪音由 reducer 兜底）。 */
function asPetEvent(event: unknown): PetSessionEvent {
  const e = event as Partial<PetSessionEvent> | undefined
  return {
    type: typeof e?.type === 'string' ? e.type : '',
    seq: typeof e?.seq === 'number' ? e.seq : 0,
    time: typeof e?.time === 'number' ? e.time : 0,
    data: (e?.data ?? {}) as Record<string, unknown>,
  }
}

/**
 * O(新事件) 读取当前标题：注册表按水位线增量推进每个单元的折叠，`stateOf`
 * 只补齐本会话尚未折叠的事件（每事件全局只折叠一次）。热路径用这个。
 */
function projectedTitleOf(session: unknown): string | undefined {
  projections ??= host?.get?.('sessionProjections') as ProjectionRegistryLike | undefined
  const title = projections?.stateOf?.(session, 'title')
  return typeof title === 'string' && title ? title : undefined
}

/**
 * 会话首次出现时的标题：优先投影；投影不可用（未装配 session-projection 或
 * key 未注册）才退化为 `sessionTitle.get()` —— 后者是 O(整份会话日志) 的
 * `foldSessionTitle(session.snapshotEvents())`，因此每个会话只允许调用一次。
 */
function titleOnFirstSight(session: unknown): string | undefined {
  return projectedTitleOf(session) ?? titleService?.get?.(session)?.title
}

const reducer = createPetSessionReducer((action, payload) => broadcast(action, payload))

/** 把一帧增量广播给全部消费者（写失败由各自的关闭回调清理）。 */
function broadcast(action: 'create' | 'update' | 'remove', payload: PetSessionPayload): void {
  const frame = JSON.stringify({ action, payload })
  for (const sink of sinks)
    sink.push(frame)
}

function handleSessionEvent(session: unknown, event: unknown): void {
  const petEvent = asPetEvent(event)
  const id = sessionIdOf(session, petEvent)
  if (!id)
    return
  // 标题：首次出现走一次「投影 → 全量折叠」；此后只读 O(1) 投影（不可用时
  // 由 reducer 的 session/title 分支增量带入，绝不重新全量折叠）。
  const firstSight = !known.has(id)
  if (firstSight)
    known.add(id)
  const peer = firstSight
    ? peerOf(session, petEvent, titleOnFirstSight)
    : peerOf(session, petEvent, projectedTitleOf)
  if (firstSight)
    reducer.create(peer)
  reducer.apply(peer, petEvent)
}

function handleSessionDisposed(session: unknown): void {
  // remove 载荷只用 id：这里同样不折叠标题，避免销毁路径再付一次 O(日志) 成本。
  const peer = peerOf(session, { type: '', seq: 0, time: 0, data: {} })
  if (!peer.id)
    return
  known.delete(peer.id)
  reducer.remove(peer.id)
}

/**
 * agent 空闲兜底（`agent/status → idle`）：把「回合已收尾」这个事实传给 reducer，
 * 让核心漏发 `turn/end` 的中断（用户中止、被父级中断、异常收尾）也能回落空闲。
 * 载荷形状来自核心的 agent-scoped 事件（`agentEvents` 把 agent 融进 payload）：
 * `{ status, agent }`，会话 id 在 `agent.session.id`；与 turnrewind 宿主侧同一读取面。
 */
function handleAgentStatus(payload: unknown): void {
  const event = payload as { status?: unknown, agent?: { session?: { id?: unknown } } } | undefined
  if (event?.status !== 'idle')
    return
  const id = event.agent?.session?.id
  if (typeof id !== 'string' || id.length === 0)
    return
  reducer.idle(id)
}

/** 首个消费者接入：解析宿主服务面并挂载会话事件监听（幂等）。 */
function attachSessionEvents(ctx: HostContext): void {
  if (disposeSessionEvents !== undefined)
    return
  host = ctx
  // 惰性解析：apply 时服务未必就绪（装配顺序不保证），首个消费者接入时才读。
  titleService = ctx.get?.('sessionTitle') as TitleServiceLike | undefined
  projections ??= ctx.get?.('sessionProjections') as ProjectionRegistryLike | undefined
  const disposeEvent = ctx.on('session/event', handleSessionEvent) as () => void
  const disposeDisposed = ctx.on('session/disposed', handleSessionDisposed) as () => void
  // idle 兜底与 session/event 同生命周期：没有消费者时同样不订阅（热路径彻底退出）。
  const disposeStatus = ctx.on('agent/status', handleAgentStatus) as () => void
  disposeSessionEvents = () => {
    disposeEvent()
    disposeDisposed()
    disposeStatus()
  }
}

/** 最后一个消费者断开：注销监听并丢弃累计态，下次订阅从零重建。 */
function detachSessionEvents(): void {
  if (disposeSessionEvents === undefined)
    return
  disposeSessionEvents()
  disposeSessionEvents = undefined
  reducer.clear()
  known.clear()
}

/**
 * 接入一个 SSE 消费者：登记后（首个消费者时）挂载会话总线监听。
 *
 * @param ctx - 宿主上下文（经 `dshContextOf(event)` 取回）。
 * @param sink - 该连接的推送/关闭出口。
 * @returns 断开该消费者的清理函数（幂等；最后一个消费者断开时注销总线监听）。
 */
export function openSessionStream(ctx: HostContext, sink: SessionStreamSink): () => void {
  sinks.add(sink)
  attachSessionEvents(ctx)
  return () => {
    sinks.delete(sink)
    if (sinks.size === 0)
      detachSessionEvents()
  }
}

/**
 * 插件卸载收尾：结束所有在途连接、注销总线监听并丢弃累计态与服务引用
 * （等价旧实现的 effect 清理：`response.end()` + `detachSessionEvents()`）。
 */
export function closeSessionStreams(): void {
  const open = [...sinks]
  sinks.clear()
  detachSessionEvents()
  host = undefined
  titleService = undefined
  projections = undefined
  for (const sink of open)
    sink.close()
}
