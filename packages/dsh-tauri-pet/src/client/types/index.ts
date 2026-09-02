/** types/index.ts — 本插件文案键集合（zh 字典为权威）与桌宠桥类型。 */

/** 桌宠当前状态（与桌面端 bridge/pet.rs 的 PetStatus 对齐）。 */
export interface PetStatus {
  enabled: boolean
  active_pet?: string | null
  /** 宠物大小百分比（50–200，100 = 精灵图原始尺寸）；null/缺省 = 未设置。 */
  pet_size?: number | null
}

/** 已导入的桌宠资源包条目（与桌面端 bridge/pet.rs 的 PetListItem 对齐）。 */
export interface PetListItem {
  /** 资源包标志（文件名去 .zip；同时作为 active_pet 的取值）。 */
  id: string
  /** 展示名（与 id 相同：导入即以文件名命名）。 */
  name: string
}

/** 文案键（locale 字典键集合的权威来源）。 */
export type LocaleKey
  = | 'name'
    | 'selectPet'
    | 'refresh'
    | 'create'
    | 'createHint'
    | 'wakePet'
    | 'collapsePet'
    | 'import'
    | 'imported'
    | 'selected'
    | 'select'
    | 'tabInstalledDesc'
    | 'tabCodexDesc'
    | 'petNameDsh'
    | 'petNameCodex'
    | 'petDescDsh'
    | 'petDescCodex'
    | 'emptyImported'
    | 'importFailed'
    | 'listFailed'
    | 'toggleFailed'
    | 'setPetFailed'
    | 'setSizeFailed'
    | 'sizeLabel'
    | 'sizeHint'
