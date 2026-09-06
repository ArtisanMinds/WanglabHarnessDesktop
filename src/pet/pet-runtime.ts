import type { PetConfig } from './pet-config'
import { invoke } from '@tauri-apps/api/core'

export interface PetRuntimeStatus {
  active_pet: string | null
  enabled: boolean
  visible: boolean
  ready: boolean
  error: string | null
  pet_size: number | null
  render_id: number
  revision: number
}

export interface PetSpriteAsset {
  columns: number
  id: string
  rows: number
  sprite_version_number: number
  spritesheet: string
}

export interface PetResources {
  id: string
  renderId: number
  sprite: PetSpriteAsset | null
  config: PetConfig | null
  assets: Record<string, string>
}

export const INITIAL_PET_STATUS: PetRuntimeStatus = {
  active_pet: null,
  enabled: false,
  visible: false,
  ready: false,
  error: null,
  pet_size: null,
  render_id: 0,
  revision: 0,
}

export async function loadPetResources(id: string, renderId: number): Promise<PetResources> {
  if (id.includes(':')) {
    const sprite = await invoke<PetSpriteAsset>('get_pet_asset', { id })
    if (sprite.id !== id || sprite.sprite_version_number !== 2 || sprite.columns !== 8
      || sprite.rows !== 11 || !/^data:image\/(?:png|webp);base64,\S+$/.test(sprite.spritesheet)) {
      throw new Error('PET_ASSET_INVALID: unsupported or missing spritesheet')
    }
    return { id, renderId, sprite, config: null, assets: {} }
  }
  const [config, { assets }] = await Promise.all([
    invoke<PetConfig>('get_preset_pet_config', { id }),
    invoke<{ assets: Record<string, string> }>('get_preset_pet_assets', { id }),
  ])
  if (!config.animations.idle.length || config.animations.idle.some(name => !assets[name]))
    throw new Error('PET_PRESET_ASSETS_MISSING: idle animations are not installed')
  return { id, renderId, sprite: null, config, assets }
}

export function reportPetRender(
  status: Pick<PetRuntimeStatus, 'active_pet' | 'render_id'>,
  error: string | null = null,
): void {
  if (!status.active_pet)
    return
  void invoke('report_pet_render', { id: status.active_pet, renderId: status.render_id, error })
    .catch(error => console.error('[pet] PET_RENDER_REPORT_FAILED:', error))
}
