/** types/index.ts — 本插件文案键集合（zh 字典为权威）与桌宠桥类型。 */

/** 桌宠当前状态（与桌面端 bridge/pet.rs 的 PetStatus 对齐）。 */
export interface PetStatus {
  enabled: boolean
  active_pet?: string | null
}

/** 文案键（locale 字典键集合的权威来源）。 */
export type LocaleKey
  = | 'name'
    | 'enable'
    | 'disable'
    | 'enabled'
    | 'disabled'
    | 'close'
    | 'selectPet'
    | 'show'
    | 'hide'
    | 'chooseCodex'
    | 'import'
    | 'pets'
    | 'petWindowHint'
    | 'enabledHint'
    | 'disabledHint'
    | 'loadFailed'
    | 'setEnabledFailed'
    | 'setPetFailed'
