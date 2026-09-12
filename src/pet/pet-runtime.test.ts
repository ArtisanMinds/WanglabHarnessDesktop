import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_PET_STATUS, loadPetSprite, reportPetRender } from './pet-runtime'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

beforeEach(() => vi.mocked(invoke).mockReset())

describe('pet resource loading', () => {
  it('starts without a selected or visible pet', () => {
    expect(INITIAL_PET_STATUS).toMatchObject({ active_pet: null, enabled: false, visible: false, ready: false })
  })

  it('loads a selected custom sprite with its actual frame dimensions', async () => {
    const sprite = { id: 'chat:custom', columns: 8, rows: 11, sprite_version_number: 2, spritesheet: 'data:image/png;base64,AQID', frame_width: 16, frame_height: 20 }
    vi.mocked(invoke).mockResolvedValue(sprite)
    const loaded = await loadPetSprite('chat:custom')
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_pet_asset', { id: 'chat:custom' })
    expect(loaded).toEqual(sprite)
  })

  it('loads nine-row legacy packs and rejects a mismatched version marker', async () => {
    const sprite = { id: 'chat:legacy', columns: 8, rows: 9, sprite_version_number: 1, spritesheet: 'data:image/webp;base64,AQID', frame_width: 192, frame_height: 192 }
    vi.mocked(invoke).mockResolvedValue(sprite)
    expect(await loadPetSprite('chat:legacy')).toEqual(sprite)
    vi.mocked(invoke).mockResolvedValue({ ...sprite, sprite_version_number: 2 })
    await expect(loadPetSprite('chat:legacy')).rejects.toThrow('PET_ASSET_INVALID')
  })

  it('rejects missing and mismatched sprites instead of silently rendering nothing', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('PET_NOT_FOUND: removed'))
    await expect(loadPetSprite('chat:missing')).rejects.toThrow('PET_NOT_FOUND')
    vi.mocked(invoke).mockResolvedValue({ id: 'codex:other', columns: 8, rows: 11, sprite_version_number: 2, spritesheet: '' })
    await expect(loadPetSprite('chat:custom')).rejects.toThrow('PET_ASSET_INVALID')
  })

  it('never reads pet directories belonging to another application', async () => {
    await expect(loadPetSprite('codex:custom')).rejects.toThrow('PET_SOURCE_INVALID')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports the render generation with both success and decode errors', () => {
    vi.mocked(invoke).mockResolvedValue(undefined)
    reportPetRender({ active_pet: null, render_id: 1 })
    expect(invoke).not.toHaveBeenCalled()
    reportPetRender({ active_pet: 'chat:custom', render_id: 2 })
    reportPetRender({ active_pet: 'chat:custom', render_id: 2 }, 'PET_MEDIA_DECODE_FAILED')
    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['report_pet_render', { id: 'chat:custom', renderId: 2, error: null }],
      ['report_pet_render', { id: 'chat:custom', renderId: 2, error: 'PET_MEDIA_DECODE_FAILED' }],
    ])
  })
})
