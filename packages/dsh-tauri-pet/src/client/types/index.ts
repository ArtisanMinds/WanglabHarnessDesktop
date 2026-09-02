/** types/index.ts — 本插件文案键集合（zh 字典为权威）与桌宠桥类型。 */

/** 桌宠当前状态（与桌面端 bridge/pet.rs 的 PetStatus 对齐）。 */
export interface PetStatus {
  enabled: boolean
  active_pet?: string | null
  /** 精灵图显示宽度（逻辑像素）；null/缺省 = 未设置，窗口侧用默认值。 */
  pet_size?: number | null
}

/** 文案键（locale 字典键集合的权威来源）。 */
export type LocaleKey
  = | 'name'
    | 'enable'
    | 'disable'
    | 'enabled'
    | 'disabled'
    | 'selectPet'
    | 'show'
    | 'hide'
    | 'chooseCodex'
    | 'petWindowHint'
    | 'enabledHint'
    | 'disabledHint'
    | 'loadFailed'
    | 'setEnabledFailed'
    | 'setPetFailed'
    | 'setSizeFailed'
    | 'sizeLabel'
    | 'sizeHint'
