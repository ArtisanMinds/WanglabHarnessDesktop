import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_PET_STATUS, loadPetResources } from './pet-runtime'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

beforeEach(() => vi.mocked(invoke).mockReset())

describe('pet resource loading', () => {
  it('starts without a selected or visible pet', () => {
    expect(INITIAL_PET_STATUS).toMatchObject({ active_pet: null, enabled: false, visible: false, ready: false })
  })

  it('keeps the selected custom sprite and render attempt together', async () => {
    const sprite = { id: 'chat:custom', columns: 8, rows: 11, sprite_version_number: 2, spritesheet: 'data:image/png;base64,AQID' }
    vi.mocked(invoke).mockResolvedValue(sprite)
    const loaded = await loadPetResources('chat:custom', 4)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_pet_asset', { id: 'chat:custom' })
    expect(loaded).toEqual({ id: 'chat:custom', renderId: 4, sprite, config: null, assets: {} })
  })

  it('loads nine-row legacy packs and rejects a mismatched version marker', async () => {
    const sprite = { id: 'chat:legacy', columns: 8, rows: 9, sprite_version_number: 1, spritesheet: 'data:image/webp;base64,AQID' }
    vi.mocked(invoke).mockResolvedValue(sprite)
    expect((await loadPetResources('chat:legacy', 1)).sprite).toEqual(sprite)
    vi.mocked(invoke).mockResolvedValue({ ...sprite, sprite_version_number: 2 })
    await expect(loadPetResources('chat:legacy', 2)).rejects.toThrow('PET_ASSET_INVALID')
  })

  it('rejects missing and mismatched sprites instead of silently rendering nothing', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('PET_NOT_FOUND: removed'))
    await expect(loadPetResources('chat:missing', 1)).rejects.toThrow('PET_NOT_FOUND')
    vi.mocked(invoke).mockResolvedValue({ id: 'codex:other', columns: 8, rows: 11, sprite_version_number: 2, spritesheet: '' })
    await expect(loadPetResources('chat:custom', 2)).rejects.toThrow('PET_ASSET_INVALID')
  })

  it('rejects a preset whose configured idle animation is missing', async () => {
    vi.mocked(invoke).mockImplementation(async command => command === 'get_preset_pet_config'
      ? { animations: { idle: ['idle'] } }
      : { assets: { fallback: 'dsh-pet://localhost/custom/preview.gif' } })
    await expect(loadPetResources('custom', 3)).rejects.toThrow('PET_PRESET_ASSETS_MISSING')
  })
})
