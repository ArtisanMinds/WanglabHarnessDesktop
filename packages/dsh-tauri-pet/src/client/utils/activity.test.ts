import type { SessionLiveActivity } from '../types'
import { describe, expect, it } from 'vitest'
import { PET_REASONING_TAIL_LENGTH } from '../constants'
import { foldSessionActivity } from './activity'

function chunkEvent(chunk: Record<string, unknown>): Record<string, unknown> {
  return { type: 'assistant/chunk', data: { chunk } }
}

function toolCallEvent(callId: string, name: string, args?: string): Record<string, unknown> {
  return { type: 'tool/call', data: { callId, name, arguments: args } }
}

function toolResultEvent(callId: string): Record<string, unknown> {
  return { type: 'tool/result', data: { message: { source: { callId }, content: [] } } }
}

describe('foldSessionActivity', () => {
  it('累积 reasoning-delta 为思考活动，且只保留尾部窗口', () => {
    const text = 'a'.repeat(PET_REASONING_TAIL_LENGTH + 20)
    const entries = [
      chunkEvent({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunkEvent({ type: 'reasoning-delta', index: 0, text }),
    ]
    const activity = foldSessionActivity(entries)
    expect(activity?.kind).toBe('reasoning')
    expect(activity?.text).toBe('a'.repeat(PET_REASONING_TAIL_LENGTH))
  })

  it('block-end 关闭思考块后无活动', () => {
    const entries = [
      chunkEvent({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunkEvent({ type: 'reasoning-delta', index: 0, text: '推理中' }),
      chunkEvent({ type: 'block-end', index: 0 }),
    ]
    expect(foldSessionActivity(entries)).toBeNull()
  })

  it('进行中的工具调用（无对应 result）优先于思考流', () => {
    const entries = [
      chunkEvent({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunkEvent({ type: 'reasoning-delta', index: 0, text: '先想一下' }),
      chunkEvent({ type: 'block-end', index: 0 }),
      toolCallEvent('call-1', 'pwsh', '{"command":"pnpm build"}'),
    ]
    const activity = foldSessionActivity(entries)
    expect(activity).toEqual({ kind: 'tool', name: 'pwsh', args: '{"command":"pnpm build"}' })
  })

  it('tool/result 按 message.source.callId 关闭调用；多个未完成调用取最新', () => {
    const entries = [
      toolCallEvent('call-1', 'read', '{"file_path":"a.ts"}'),
      toolCallEvent('call-2', 'str_replace_editor', '{"path":"b.ts"}'),
      toolResultEvent('call-1'),
    ]
    const activity = foldSessionActivity(entries)
    expect(activity?.kind).toBe('tool')
    expect(activity?.name).toBe('str_replace_editor')
  })

  it('step/start 边界清空上一段残留（中止调用不污染下一步）', () => {
    const entries = [
      toolCallEvent('call-1', 'bash', '{"command":"exit 1"}'),
      { type: 'step/start', data: { turn: 1, step: 2 } },
      chunkEvent({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunkEvent({ type: 'reasoning-delta', index: 0, text: '重新思考' }),
    ]
    const activity = foldSessionActivity(entries)
    expect(activity).toEqual({ kind: 'reasoning', text: '重新思考' })
  })

  it('turn/end 后无活动；非对象条目与未知事件类型被忽略', () => {
    const entries = [
      toolCallEvent('call-1', 'pwsh', '{"command":"pnpm test"}'),
      { type: 'turn/end', data: { turn: 1 } },
      null,
      42,
      { type: 'user/message', data: { text: 'hi' } },
    ]
    expect(foldSessionActivity(entries)).toBeNull()
  })

  it('空窗口返回 null', () => {
    expect(foldSessionActivity([])).toBeNull()
  })

  it('返回 null 而不是未定义字段的对象（text/name 只在对应 kind 出现）', () => {
    const entries = [
      chunkEvent({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunkEvent({ type: 'reasoning-delta', index: 0, text: '思考' }),
    ]
    const activity = foldSessionActivity(entries) as SessionLiveActivity
    expect('name' in activity).toBe(false)
    expect('args' in activity).toBe(false)
  })
})
