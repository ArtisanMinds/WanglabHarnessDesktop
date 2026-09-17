import type { LlmDiscoveredModel } from '../types/remotes.ts'
import { describe, expect, it } from 'vitest'
import {
  hasModelConfig,
  imageInputValue,
  mergeModelCards,
  modelConfigNotice,
  supportsImageInput,
  withCount,
  withDetail,
  withPath,
} from './model-config.utils'

const found = (id: string, extra: Partial<LlmDiscoveredModel> = {}): LlmDiscoveredModel => ({ id, ...extra })

describe('hasModelConfig', () => {
  it('treats an identity-only row as unconfigured', () => {
    expect(hasModelConfig({ id: 'm', name: 'M', description: 'd' })).toBe(false)
  })

  it('reports every capability field as configuration', () => {
    expect(hasModelConfig({ id: 'm', contextWindow: 1024 })).toBe(true)
    expect(hasModelConfig({ id: 'm', maxTokens: 128 })).toBe(true)
    expect(hasModelConfig({ id: 'm', input: ['text'] })).toBe(true)
    expect(hasModelConfig({ id: 'm', reasoningEfforts: false })).toBe(true)
  })
})

describe('supportsImageInput', () => {
  it('reads an explicit image declaration as on', () => {
    expect(supportsImageInput({ id: 'm', input: ['text', 'image'] })).toBe(true)
  })

  it('reads inheritance and a text-only declaration as off', () => {
    expect(supportsImageInput({ id: 'm' })).toBe(false)
    expect(supportsImageInput({ id: 'm', input: ['text'] })).toBe(false)
    expect(supportsImageInput({ id: 'm', input: 'image' })).toBe(false)
  })

  it('encodes both switch positions as explicit declarations', () => {
    expect(imageInputValue(true)).toEqual(['text', 'image'])
    expect(imageInputValue(false)).toEqual(['text'])
  })
})

describe('mergeModelCards', () => {
  it('fills only the fields the row leaves empty', () => {
    const merged = mergeModelCards(
      [{ id: 'm', contextWindow: 4096 }],
      [found('m', { contextWindow: 262144, maxTokens: 8192 })],
    )
    expect(merged.models).toEqual([{ id: 'm', contextWindow: 4096, maxTokens: 8192 }])
    expect(merged.applied).toBe(1)
  })

  it('never rewrites a value the user already holds', () => {
    const merged = mergeModelCards([{ id: 'm', maxTokens: 512 }], [found('m', { maxTokens: 8192 })])
    expect(merged.models[0]?.maxTokens).toBe(512)
    expect(merged.applied).toBe(0)
  })

  it('limits the merge to the requested targets', () => {
    const merged = mergeModelCards(
      [{ id: 'a' }, { id: 'b' }],
      [found('a', { contextWindow: 1 }), found('b', { contextWindow: 2 })],
      ['b'],
    )
    expect(merged.models).toEqual([{ id: 'a' }, { id: 'b', contextWindow: 2 }])
    expect(merged.applied).toBe(1)
  })

  it('reports rows the endpoint did not disclose', () => {
    const merged = mergeModelCards([{ id: 'a' }, { id: 'missing' }], [found('a', { contextWindow: 1 })])
    expect(merged.undisclosed).toEqual(['missing'])
    expect(merged.models[1]).toEqual({ id: 'missing' })
  })

  it('ignores a row whose id is still blank', () => {
    const merged = mergeModelCards([{ id: '' }], [found('a', { contextWindow: 1 })])
    expect(merged.applied).toBe(0)
    expect(merged.undisclosed).toEqual([])
  })

  it('carries every listed row when no target is named', () => {
    const merged = mergeModelCards([{ id: 'a' }, { id: 'b' }], [found('a', { maxTokens: 4 })])
    expect(merged.models).toEqual([{ id: 'a', maxTokens: 4 }, { id: 'b' }])
    expect(merged.applied).toBe(1)
  })

  it('leaves a row untouched when the endpoint disclosed no capacity', () => {
    const merged = mergeModelCards([{ id: 'a' }], [found('a')])
    expect(merged.applied).toBe(0)
    expect(merged.models[0]).toEqual({ id: 'a' })
  })
})

describe('copy placeholders', () => {
  it('substitutes one placeholder without treating the rest as patterns', () => {
    expect(withDetail('failed: {detail}', '$&')).toBe('failed: $&')
    expect(withPath('opened {path}', 'C:\\a\\b')).toBe('opened C:\\a\\b')
    expect(withCount('applied to {n} models', 3)).toBe('applied to 3 models')
  })
})

describe('modelConfigNotice', () => {
  const templates = { applied: 'filled {n}', none: 'nothing', undisclosed: 'missing {n}' }

  it('reports the fill count', () => {
    expect(modelConfigNotice({ applied: 2, undisclosed: [] }, templates)).toBe('filled 2')
  })

  it('reports both halves when some rows were not disclosed', () => {
    expect(modelConfigNotice({ applied: 1, undisclosed: ['a', 'b'] }, templates)).toBe('filled 1 missing 2')
  })

  it('reports only the undisclosed half when nothing could be filled', () => {
    expect(modelConfigNotice({ applied: 0, undisclosed: ['a'] }, templates)).toBe('missing 1')
  })

  it('falls back to the empty-result copy', () => {
    expect(modelConfigNotice({ applied: 0, undisclosed: [] }, templates)).toBe('nothing')
  })
})
