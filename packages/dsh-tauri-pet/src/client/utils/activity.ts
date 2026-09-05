import type { SessionLiveActivity } from '../types'
import {
  PET_REASONING_TAIL_LENGTH,
  SESSION_EVENT_ASSISTANT_CHUNK,
  SESSION_EVENT_STEP_START,
  SESSION_EVENT_TOOL_CALL,
  SESSION_EVENT_TOOL_RESULT,
  SESSION_EVENT_TURN_END,
} from '../constants'

/** 会话事件窗口单条事件：只声明折叠用到的信封字段（SessionEvent { seq, time, type, data }）。 */
interface SessionEventLike {
  type?: unknown
  data?: unknown
}

/** assistant/chunk 事件 data：chunk 为 LLM 流式块（dsh-llm 流块联合类型）。 */
interface AssistantChunkData {
  chunk?: { type?: unknown, blockType?: unknown, text?: unknown }
}

/** tool/call 事件 data：arguments 为模型输出的原始 args JSON 串。 */
interface ToolCallData {
  arguments?: unknown
  callId?: unknown
  name?: unknown
}

/** tool/result 事件 data：callId 记录在 message.source（旧版本兼容 message.callId）。 */
interface ToolResultData {
  message?: { callId?: unknown, source?: { callId?: unknown } }
}

interface PendingToolCall {
  args?: string
  callId: string
  name: string
}

/**
 * 从会话事件窗口（MutableSessionEventSource 的 entries，按时间正序）折叠出当前
 * 正在进行的活动：进行中的工具调用（tool/call 尚无对应 tool/result）优先，其次
 * 是仍在流式输出的思考块（reasoning-delta 累积，只保留尾部窗口）。
 *
 * 事件形状对照已安装 dsh 运行时（@deepseek-ai/dsh 0.1.2-rc.1）核实：
 * dsh-agent-loop appendToolCall / appendToolResult / assistant/chunk，以及
 * dsh-client-ui-chat 的 rootCall / rootResult fold。
 */
export function foldSessionActivity(entries: readonly unknown[]): SessionLiveActivity | null {
  let reasoningOpen = false
  let reasoningTail = ''
  const pendingCalls: PendingToolCall[] = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object')
      continue
    const event = entry as SessionEventLike
    if (typeof event.type !== 'string')
      continue
    const data = (event.data ?? {}) as Record<string, unknown>

    switch (event.type) {
      case SESSION_EVENT_ASSISTANT_CHUNK: {
        const { chunk } = data as AssistantChunkData
        if (!chunk || typeof chunk !== 'object')
          break
        if (chunk.type === 'block-start') {
          // 块按顺序开关：新块开始即关闭遗留思考块（异常流的防御，正常流先收到 block-end）
          reasoningOpen = false
          reasoningTail = ''
          if (chunk.blockType === 'reasoning')
            reasoningOpen = true
          break
        }
        if (chunk.type === 'reasoning-delta' && reasoningOpen && typeof chunk.text === 'string') {
          reasoningTail = (reasoningTail + chunk.text).slice(-PET_REASONING_TAIL_LENGTH)
          break
        }
        if (chunk.type === 'block-end' && reasoningOpen) {
          reasoningOpen = false
          reasoningTail = ''
        }
        break
      }

      case SESSION_EVENT_TOOL_CALL: {
        const { callId, name, arguments: args } = data as ToolCallData
        if (typeof callId !== 'string' || callId.length === 0)
          break
        // 同 callId 重放（日志回放/窗口重建）时替换旧记录，保持最新顺序
        const existing = pendingCalls.findIndex(call => call.callId === callId)
        if (existing >= 0)
          pendingCalls.splice(existing, 1)
        pendingCalls.push({
          callId,
          name: typeof name === 'string' ? name : '',
          args: typeof args === 'string' ? args : undefined,
        })
        break
      }

      case SESSION_EVENT_TOOL_RESULT: {
        const { message } = data as ToolResultData
        const callId = message?.source?.callId ?? message?.callId
        if (typeof callId !== 'string')
          break
        const existing = pendingCalls.findIndex(call => call.callId === callId)
        if (existing >= 0)
          pendingCalls.splice(existing, 1)
        break
      }

      case SESSION_EVENT_STEP_START:
      case SESSION_EVENT_TURN_END: {
        // 步/轮边界清空上一段活动：被中止的调用或中断的思考块不残留到下一段展示
        pendingCalls.length = 0
        reasoningOpen = false
        reasoningTail = ''
        break
      }
    }
  }

  const current = pendingCalls.at(-1)
  if (current !== undefined)
    return { kind: 'tool', name: current.name, args: current.args }
  if (reasoningOpen && reasoningTail.length > 0)
    return { kind: 'reasoning', text: reasoningTail }
  return null
}
