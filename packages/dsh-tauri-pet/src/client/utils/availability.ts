import type { PetListItem, PresetPetItem } from '../types'

/**
 * 是否存在可直接使用的宠物：可播放的预设条目或应用内已安装宠物。
 * 市场中尚未下载的条目不在这两份清单中。
 */
export function hasAvailablePets(
  presets: readonly PresetPetItem[],
  chatPets: readonly PetListItem[],
): boolean {
  return presets.length > 0 || chatPets.length > 0
}
