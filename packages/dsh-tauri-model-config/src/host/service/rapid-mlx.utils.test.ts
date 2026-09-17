import { describe, expect, it } from 'vitest'
import { normalizeModelCard, normalizeModelCards } from './rapid-mlx.utils'

describe('normalizeModelCard', () => {
  it('prefers the memory-fitted max_model_len over the native window', () => {
    expect(normalizeModelCard({ id: 'qwen3.6-35b-8bit', context_window: 262144, max_model_len: 131072 }))
      .toEqual({ id: 'qwen3.6-35b-8bit', contextWindow: 131072 })
  })

  it('falls back to the native window on a server that does not report max_model_len', () => {
    expect(normalizeModelCard({ id: 'm', context_window: 32768 })).toEqual({ id: 'm', contextWindow: 32768 })
  })

  it('maps capabilities to the declared input modalities', () => {
    expect(normalizeModelCard({ id: 'vlm', capabilities: ['text', 'vision'] })?.input).toEqual(['text', 'image'])
    expect(normalizeModelCard({ id: 'text-only', capabilities: ['text'] })?.input).toEqual(['text'])
  })

  it('leaves input unset when capabilities is absent rather than guessing', () => {
    expect(normalizeModelCard({ id: 'm' })).toEqual({ id: 'm' })
  })

  it('rejects entries without a usable id', () => {
    expect(normalizeModelCard({ id: '   ' })).toBeUndefined()
    expect(normalizeModelCard('qwen')).toBeUndefined()
    expect(normalizeModelCard(undefined)).toBeUndefined()
  })

  it('ignores non-positive capacities', () => {
    expect(normalizeModelCard({ id: 'm', max_model_len: 0, context_window: -1 })).toEqual({ id: 'm' })
  })

  it('reads max output tokens from the endpoint aliases', () => {
    expect(normalizeModelCard({ id: 'm', max_output_tokens: 8192 })?.maxTokens).toBe(8192)
    expect(normalizeModelCard({ id: 'm', limit: { output: 4096 } })?.maxTokens).toBe(4096)
  })
})

describe('normalizeModelCards', () => {
  it('reads the OpenAI list envelope and drops unusable rows', () => {
    expect(normalizeModelCards({ data: [{ id: 'a', capabilities: ['vision'] }, { name: 'no id' }, { id: 'b' }] }))
      .toEqual([{ id: 'a', input: ['text', 'image'] }, { id: 'b' }])
  })

  it('answers an empty list for a payload without a data array', () => {
    expect(normalizeModelCards({ error: 'nope' })).toEqual([])
    expect(normalizeModelCards(undefined)).toEqual([])
  })
})
