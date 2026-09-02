/**
 * constants.ts — dsh-tauri-pet 稳定标识：插件名、shell.overlay 组件 id、
 * locale 命名空间、与桌面端 invoke 桥对齐的 command 名。
 *
 * shell.overlay 是 list/root 槽（第三方通用浮层，点击穿透——条目自行 opt-in
 * 事件）。本插件用两个独立 id 并排注册：
 *   - PET_ICON_SLOT_ID     侧栏右下「宠物入口」小图标（激活时右上角绿色圆点）
 *   - PET_SETTINGS_SLOT_ID 独立的「宠物」设置页（类归档页的停靠面板）
 */

/** 插件名（npm 包名，宿主错误注册表与列表主键）。 */
export const PET_CLIENT_PLUGIN = 'dsh-tauri-pet'

/** 侧栏宠物入口图标注册进 `shell.overlay` 的组件 id。 */
export const PET_ICON_SLOT_ID = 'dsh-tauri-pet-icon'
/** 宠物设置页注册进 `shell.overlay` 的组件 id。 */
export const PET_SETTINGS_SLOT_ID = 'dsh-tauri-pet-settings'

/** 样式 effect id（css-render 卸载句柄）。 */
export const PET_STYLES_EFFECT = 'dsh-tauri-pet: styles'
/** 图标注册 effect id。 */
export const PET_ICON_EFFECT = 'dsh-tauri-pet: shell.overlay icon'
/** 设置页注册 effect id。 */
export const PET_SETTINGS_EFFECT = 'dsh-tauri-pet: shell.overlay settings'

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

// ── 侧栏几何（shell.overlay 覆盖层无法读到框架变量，用稳定选择器测量）──
/** 侧栏容器选择器（dsh 客户端侧栏；dsh-tauri-ui 亦以此测量宽度）。 */
export const SIDEBAR_SELECTOR = '[data-slot="sidebar"]'
/** 入口图标在侧栏底部「设置入口」右侧的横向内边距（px）。 */
export const PET_ICON_OFFSET_RIGHT = 14
/** 入口图标距侧栏底部的高度（px，与设置入口对齐）。 */
export const PET_ICON_OFFSET_BOTTOM = 14
/** 侧栏折叠（rail）时入口图标拟并入轨道（px）。 */
export const RAIL_ICON_SIZE = 34
