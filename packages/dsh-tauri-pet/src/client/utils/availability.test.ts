import type { PetListItem, PresetPetItem } from '../types'
import { describe, expect, it } from 'vitest'
import { hasAvailablePets } from './availability'

function preset(): PresetPetItem {
  return { id: 'remote-test', name: 'Remote test' }
}

function listItem(id: string, source: PetListItem['source']): PetListItem {
  return { id, name: id, source }
}

describe('hasAvailablePets', () => {
  it('空清单 → false', () => {
    expect(hasAvailablePets([], [])).toBe(false)
  })

  it('清单中的远端预设无需安装即可使用', () => {
    expect(hasAvailablePets([preset()], [])).toBe(true)
  })

  it('应用内宠物 → true', () => {
    expect(hasAvailablePets([], [listItem('chat-pet', 'chat')])).toBe(true)
    expect(hasAvailablePets([preset()], [listItem('a', 'chat')])).toBe(true)
  })
})
