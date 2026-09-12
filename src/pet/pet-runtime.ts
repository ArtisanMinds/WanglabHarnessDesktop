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
  frame_width: number
  frame_height: number
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

export async function loadPetSprite(id: string): Promise<PetSpriteAsset> {
  if (!id.startsWith('chat:'))
    throw new Error('PET_SOURCE_INVALID: source must be chat')
  const sprite = await invoke<PetSpriteAsset>('get_pet_asset', { id })
  const supportedLayout = (sprite.sprite_version_number === 1 && sprite.rows === 9)
    || (sprite.sprite_version_number === 2 && sprite.rows === 11)
  if (sprite.id !== id || !supportedLayout || sprite.columns !== 8
    || !Number.isInteger(sprite.frame_width) || sprite.frame_width <= 0
    || !Number.isInteger(sprite.frame_height) || sprite.frame_height <= 0
    || !/^data:image\/(?:png|webp);base64,\S+$/.test(sprite.spritesheet)) {
    throw new Error('PET_ASSET_INVALID: unsupported or missing spritesheet')
  }
  return sprite
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
