/**
 * host/routes/session-stream/get.ts — `GET /api/dsh-pet/session-stream`：
 * 桌宠会话增量 SSE 流（Rust 消费端按 `SESSION_STREAM_PATH` 订阅后 `emit_to('pet')`）。
 *
 * 处理器体内直接写请求级逻辑：建流、挂消费者、起心跳、断连清理；会话总线的投影逻辑
 * 全在 `../../session-stream`（只收「一帧 JSON 载荷」这个具体参数）。
 *
 * 帧格式（与 Rust 消费端逐字对齐，见 `src-tauri/src/bridge/pet.rs`）：
 *   - 数据帧 `data: {"action":…,"payload":…}\n\n`；
 *   - 心跳注释帧 `: keepalive\n\n`（每 `SSE_KEEPALIVE_MS`）；
 *   - 重连提示 `retry: 1000`：h3 的 `EventStream` 不产生「只有字段、没有 data」的帧，
 *     而 Rust 端把空 `data:` 行也当作一帧 JSON 解析（解析失败即断流重连），
 *     因此 retry 只能随**首帧**数据一起发（`{ retry, data }`），不发单独的 retry 帧。
 *
 * 方法限制（405 + allow）、OPTIONS 204、连接鉴权、回环/跨源校验与请求体上限由
 * `defineRoutes` 统一承担，这里不再重复实现。
 */
import type { HostContext } from 'dsh-tauri'
import type { SessionStreamSink } from '../../session-stream'
import { defineEventHandler, dshContextOf, EventStream } from 'dsh-tauri'
import { SSE_KEEPALIVE_COMMENT, SSE_KEEPALIVE_MS, SSE_RETRY_MS } from '../../../shared/constants'
import { openSessionStream } from '../../session-stream'

export default defineEventHandler((event) => {
  // 注册期由 defineRoutes 把宿主 ctx 挂到 event.context.dsh（结构上是 HostContext）。
  const host = dshContextOf(event) as unknown as HostContext
  const stream = new EventStream(event)
  // 接入即刷一帧注释：Node 的 `writeHead` 不会单独把响应头写出去，若连接建立后
  // 长时间没有会话事件，客户端会一直拿不到响应头（旧实现靠开头的 `retry: 1000` 刷出）。
  // 注释帧被所有 SSE 客户端忽略，语义上等价于「连接已就绪」。
  void stream.pushComment(SSE_KEEPALIVE_COMMENT)
  // retry 随首帧发一次（见文件头：单独发会多出一条空 data 行，Rust 端会断流）。
  let retrySent = false

  const sink: SessionStreamSink = {
    push(frame) {
      if (retrySent) {
        void stream.push({ data: frame })
        return
      }
      retrySent = true
      void stream.push({ retry: SSE_RETRY_MS, data: frame })
    },
    close() {
      void stream.close()
    },
  }

  // 有消费者才开始监听会话总线（桌宠关闭时 Rust 不会连上来）。
  const detach = openSessionStream(host, sink)
  // 心跳注释帧，防止代理/空闲断连。
  const keepalive = setInterval(() => {
    void stream.pushComment(SSE_KEEPALIVE_COMMENT)
  }, SSE_KEEPALIVE_MS)
  // 客户端断开（或插件卸载主动 close）时停心跳并注销本消费者；
  // 最后一个消费者断开即让会话总线的热路径彻底退出。
  stream.onClosed(() => {
    clearInterval(keepalive)
    detach()
  })
  return stream
})
