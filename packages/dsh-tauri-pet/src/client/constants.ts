/**
 * constants.ts — dsh-tauri-pet 稳定标识：插件名、settings.section 分区 id、
 * 侧栏 DOM 补丁选择器、locale 命名空间、与桌面端 invoke 桥对齐的 command 名。
 *
 * 侧栏入口：不做独立浮层，而是像 dataelement/dsh-desktop 那样把一个官方
 * iconButton 样式的按钮塞进 `.sidebar.settings`（dsh-tauri-ui 设置触发器
 * 右侧，同一容器的子元素）；按钮只有「激活/未激活」两态（激活时右上角绿色
 * 小圆点），点击即切换桌宠启用状态，不弹任何面板。
 */

/** 插件名（npm 包名，宿主错误注册表与列表主键）。 */
export const PET_CLIENT_PLUGIN = 'dsh-tauri-pet'

/** 宠物设置分区注册进 `settings.section` 槽的条目 id。 */
export const PET_SECTION_ID = 'dsh-tauri-pet-settings'
/** 宠物设置分区在设置侧边栏导航中的排序（session 归档分区 220 之后）。 */
export const PET_SECTION_ORDER = 230

/** 样式 effect id（css-render 卸载句柄）。 */
export const PET_STYLES_EFFECT = 'dsh-tauri-pet: styles'
/** 宠物设置分区注册 effect id。 */
export const PET_SECTION_EFFECT = 'dsh-tauri-pet: settings section'
/** 侧栏入口图标 DOM 补丁 effect id。 */
export const PET_ICON_PATCH_EFFECT = 'dsh-tauri-pet: sidebar icon patch'

/** 本插件文案命名空间（与 locale 注册键一致）。 */
export const PET_CLIENT_NS = 'dsh-tauri-pet'

// ── 桌面端 Tauri command（经 dsh-tauri invoke 桥调用）─────────────
/** 查询桌宠状态（enabled + active_pet + pet_size）。 */
export const CMD_GET_PET_STATUS = 'get_pet_status'
/** 启用/停用桌宠。 */
export const CMD_SET_PET_ENABLED = 'set_pet_enabled'
/** 选择桌宠。 */
export const CMD_SET_ACTIVE_PET = 'set_active_pet'
/** 设置精灵图显示宽度（设置页拖动条）。 */
export const CMD_SET_PET_SIZE = 'set_pet_size'
/** 显示桌宠窗口（需已启用）。 */
export const CMD_SHOW_PET = 'show_pet'
/** 隐藏桌宠窗口（不改 enabled）。 */
export const CMD_HIDE_PET = 'hide_pet'
/** 列出已导入的桌宠资源包（.zip）。 */
export const CMD_LIST_PETS = 'list_pets'
/** 导入桌宠资源包（.zip，base64 上传）。 */
export const CMD_IMPORT_PET = 'import_pet'

/** 内置可选桌宠（展示名/描述走 locale；导入包按文件名展示）。 */
export const DEFAULT_PETS = [
  { id: 'dsh', label: 'Deepseek' },
  { id: 'codex', label: 'Codex' },
] as const

// ── 侧栏入口 DOM 补丁（参照 dsh-tauri-session 的 workspace-patch 模式）──
/** 侧栏容器选择器（dsh 客户端侧栏根；补丁用它判定侧栏是否就绪）。 */
export const SIDEBAR_SELECTOR = '[data-slot="sidebar"]'
/** dsh-tauri-ui 设置触发器按钮（宠物入口插到它的右侧，同容器子元素）。 */
export const SETTINGS_TRIGGER_SELECTOR = '.dsh-tu-settingsTrigger'
/** 宠物入口按钮的 guard 属性（防止重复插入）。 */
export const PET_ICON_ATTRIBUTE = 'data-dsh-tauri-pet-icon'
/**
 * 设置行容器类：把 sidebar.settings 的包裹层变成 flex 行（复刻新版 dsh 客户端
 * SettingsRoot 的 triggerRow——齿轮与行内图标按钮同一行），触发器占满剩余宽度。
 */
export const PET_SETTINGS_ROW_CLASS = 'dshpet-settingsRow'
/** 补丁首轮挂载重试：500ms 一次、最多 30 次（与 session 补丁一致）。 */
export const PET_ICON_RETRY_MS = 500
export const PET_ICON_RETRY_MAX = 30

// ── 桌宠大小（设置页滑条；百分比模型，与 bridge/pet.rs 的 PET_SIZE_* 对齐）──
/** 未设置时的默认缩放百分比（100% = 精灵图原始尺寸）。 */
export const PET_DEFAULT_SIZE = 100
/** 滑条最小百分比。 */
export const PET_SIZE_MIN = 50
/** 滑条最大百分比（窗口尺寸由桌面端按同一百分比实时换算）。 */
export const PET_SIZE_MAX = 200
/** 滑条步进（拖动中每次 change 都实时提交）。 */
export const PET_SIZE_STEP = 5
