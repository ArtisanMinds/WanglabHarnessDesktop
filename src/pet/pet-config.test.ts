import type { PetCategory, PetWeights } from './pet-config'
import { describe, expect, it, vi } from 'vitest'
import {

  pick,
  pickCategoryAction,
  pickWeightedCategory,
  poolEntryToStatus,
  rollKind,
} from './pet-config'

const WEIGHTS: PetWeights = { idle: 10, turn: 5, move: 5 }

describe('rollKind', () => {
  it('maps roll ranges to idle/turn/move/action by weights', () => {
    expect(rollKind(0.0, WEIGHTS)).toBe('idle')
    expect(rollKind(0.0999, WEIGHTS)).toBe('idle')
    expect(rollKind(0.10, WEIGHTS)).toBe('turn')
    expect(rollKind(0.1499, WEIGHTS)).toBe('turn')
    expect(rollKind(0.15, WEIGHTS)).toBe('move')
    expect(rollKind(0.1999, WEIGHTS)).toBe('move')
    // topEnd = (10+5+5)/100 = 0.20，剩余 0.20~1.00 全归 action
    expect(rollKind(0.20, WEIGHTS)).toBe('action')
    expect(rollKind(0.9999, WEIGHTS)).toBe('action')
  })

  it('treats zero-sum weights as always-action', () => {
    expect(rollKind(0.0, { idle: 0, turn: 0, move: 0 })).toBe('action')
    expect(rollKind(0.9, { idle: 0, turn: 0, move: 0 })).toBe('action')
  })
})

describe('pickWeightedCategory', () => {
  const categories: PetCategory[] = [
    { id: '小动作', weight: 20, actions: ['wave', 'bubble'] },
    { id: '玩耍', weight: 20, actions: ['turn'] },
    { id: '文字', weight: 10, noMirror: true, actions: ['waiting'] },
  ]

  it('excludes noMirror categories while facing right', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95)
    const left = pickWeightedCategory(categories, 'left')
    const right = pickWeightedCategory(categories, 'right')
    // facing=right 时 noMirror 分类被排除，抽取结果只剩前两个分类
    expect(['小动作', '玩耍', '文字']).toContain(left?.id)
    expect(['小动作', '玩耍']).toContain(right?.id)
    expect(right?.id).not.toBe('文字')
    vi.restoreAllMocks()
  })

  it('skips categories without actions and returns null for empty pools', () => {
    expect(pickWeightedCategory([], 'left')).toBeNull()
    expect(pickWeightedCategory([{ id: '空', weight: 1, actions: [] }], 'left')).toBeNull()
  })
})

describe('pickCategoryAction', () => {
  it('picks an action from a weighted category', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0)
    const result = pickCategoryAction(
      [{ id: '小动作', weight: 1, actions: ['wave', 'bubble'] }],
      ['idle'],
      'left',
      'idle',
    )
    expect(result.id).toBe('小动作')
    expect(result.name).toBe('wave')
    vi.restoreAllMocks()
  })

  it('falls back to the idle pool when no category is available', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = pickCategoryAction([], ['idle', 'turn'], 'left', 'idle')
    expect(result.id).toBe('FALLBACK')
    expect(['idle', 'turn']).toContain(result.name)
    vi.restoreAllMocks()
  })
})

describe('pick', () => {
  it('picks from a pool and avoids the excluded entry when possible', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0)
    expect(pick(['a', 'b'], 'a')).toBe('b')
    vi.restoreAllMocks()
  })

  it('falls back to the original pool when exclusion empties it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0)
    expect(pick(['a'], 'a')).toBe('a')
    vi.restoreAllMocks()
  })
})

describe('poolEntryToStatus', () => {
  it('normalizes the wave asset key to the waving status', () => {
    expect(poolEntryToStatus('wave')).toBe('waving')
    expect(poolEntryToStatus('idle')).toBe('idle')
    expect(poolEntryToStatus('bubble')).toBe('bubble')
    expect(poolEntryToStatus('turn')).toBe('turn')
  })
})
