/**
 * constants.ts — dsh-tauri-pet 稳定标识：插件名、shell.overlay 控制组件 id、
 * locale 命名空间、与桌面端 invoke 桥对齐的 command 名。
 */

/** 插件名（npm 包名，宿主错误注册表与列表主键）。 */
export const PET_CLIENT_PLUGIN = 'dsh-tauri-pet'

/** 面板控件注册进 `shell.overlay`（list/root 槽，第三方通用浮层）的组件 id。 */
export const PET_CONTROL_SLOT_ID = 'dsh-tauri-pet-control'

/** 样式 effect id（css-render 卸载句柄）。 */
export const PET_STYLES_EFFECT = 'dsh-tauri-pet: styles'
/** 控件注册 effect id。 */
export const PET_CONTROL_EFFECT = 'dsh-tauri-pet: shell.overlay control'

/** 本插件文案命名空间（与 locale 注册键一致）。 */
export const PET_CLIENT_NS = 'dsh-tauri-pet'

// ── 桌面端 Tauri command（经 dsh-tauri invoke 桥调用）─────────────
/** 查询桌宠状态（enabled + active_pet）。 */
export const CMD_GET_PET_STATUS = 'get_pet_status'
/** 启用/停用桌宠。 */
export const CMD_SET_PET_ENABLED = 'set_pet_enabled'
/** 选择桌宠。 */
export const CMD_SET_ACTIVE_PET = 'set_active_pet'
/** 显示桌宠窗口（需已启用）。 */
export const CMD_SHOW_PET = 'show_pet'
/** 隐藏桌宠窗口（不改 enabled）。 */
export const CMD_HIDE_PET = 'hide_pet'

/** 内置可选桌宠列表（可导入 .zip 扩展）。 */
export const DEFAULT_PETS = [
  { id: 'codex', label: 'Codex' },
  { id: 'dsh', label: 'Deepseek' },
] as const