/**
 * src/index.ts — dsh-tauri-pet 宿主侧（node half）装配。
 *
 * 方案 1（host → rust → pet webview）：宿主把 `session/event`【增量】总线状态化
 * 重建为桌宠展示态后，经 HTTP SSE 流发布；Rust 用 reqwest 订阅该流并 `emit_to('pet')`。
 *
 * 角色划分：
 *   - host/reducer.ts         纯函数「增量事件 → 桌宠展示态」reducer（单测覆盖）；
 *   - host/session-stream.ts  订阅 session/event + session/disposed + agent/status，
 *                             把变化经 reducer 投影后交给已接入的消费者
 *                             （agent/status → idle 是「核心漏发 turn/end」的中断兜底）；
 *   - host/routes/**          HTTP 路由声明与 SSE 处理器（`defineRoutes` + h3 EventStream）；
 *   - Rust 消费端             新后台任务 reqwest GET 本 SSE 流 → emit_to
 *                             (pet_window::PET_WINDOW_LABEL, "session:*")。
 *
 * 本文件只做装配：登记路由，并在卸载时收回连接与总线监听。
 */
import type { HostContext } from 'dsh-tauri'
import { routes } from './host/routes'
import { closeSessionStreams } from './host/session-stream'

/** 插件名（诊断元数据）。 */
export const name = 'dsh-tauri-pet'

/** 需要的宿主服务：webServer（SSE 路由）、sessions（session/event 总线）。 */
export const inject = ['webServer', 'sessions']

/** SSE 流路径（Rust 消费端按 `http://127.0.0.1:<DSH_WEB_PORT>` + 此路径订阅）。 */
export { SESSION_STREAM_PATH } from './shared/constants'

/**
 * 插件体：注册桌宠会话流路由；卸载时注销路由、结束在途连接并退出会话总线。
 *
 * @param ctx - 宿主根上下文（注入 webServer / sessions）。
 */
export function apply(ctx: HostContext): void {
  ctx.effect(() => {
    const disposeRoutes = routes(ctx)
    return () => {
      disposeRoutes()
      closeSessionStreams()
    }
  }, `${name}: routes`)
}
