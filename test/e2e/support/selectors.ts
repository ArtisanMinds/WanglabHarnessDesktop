/**
 * L3 桌面端用例共享的 `data-testid` 选择器常量。
 *
 * 规范见 `docs/specs/desktop.test.md` §5：用例只认 `dsh-<业务域>-<元素名>`，
 * 禁止依赖 CSS 类名、DOM 层级或文本内容；跨用例复用的选择器一律登记在此。
 */

/** 壳层根节点（`src/layout/index.tsx`）。 */
export const SHELL_ROOT = '[data-testid="dsh-shell-root"]'

/**
 * 内嵌 dsh 页面的 iframe（`src/layout/components/iframe.tsx`）。
 *
 * 仅在 `harness.serviceHealthy` 为真时挂载；重建由 `key={harness.iframeKey}` 驱动，
 * 因此「元素实例是否被替换」是「iframe 是否被重建」的判据。
 */
export const SHELL_IFRAME = '[data-testid="dsh-shell-iframe"]'

/** 导航栏根容器（`src/layout/components/navbar.tsx`）。 */
export const NAVBAR_ROOT = '[data-testid="dsh-navbar-root"]'

/** 开发环境标记；`vite build` 产物下不应出现。 */
export const NAVBAR_DEV_CHIP = '[data-testid="dsh-navbar-dev-chip"]'

/** 「文件」下拉触发器。 */
export const NAVBAR_MENU_FILE = '[data-testid="dsh-navbar-menu-file"]'

/** 「配置」下拉触发器。 */
export const NAVBAR_MENU_CONFIG = '[data-testid="dsh-navbar-menu-config"]'

/** 「帮助」下拉触发器。 */
export const NAVBAR_MENU_HELP = '[data-testid="dsh-navbar-menu-help"]'

/** 侧边栏折叠开关；仅当 iframe 已挂载且 `dsh-tauri` 可用时渲染。 */
export const NAVBAR_SIDEBAR_TOGGLE = '[data-testid="dsh-navbar-sidebar-toggle"]'

/** 导航栏空白拖拽区（`data-tauri-drag-region`）。 */
export const NAVBAR_DRAG_REGION = '[data-testid="dsh-navbar-drag-region"]'

/** 下拉弹层根节点；三个菜单共用，仅展开时挂载。 */
export const NAVBAR_MENU_POPOVER = '[data-testid="dsh-navbar-menu-popover"]'

/** 展开中菜单的**全部**菜单项：按 testid 前缀匹配，不依赖 `role` 或 DOM 层级。 */
export const NAVBAR_MENU_ITEMS = '[data-testid^="dsh-navbar-item-"]'

/** 单个菜单项的选择器；`id` 取 `Dropdown.Item` 的 `id`（如 `new-chat`）。 */
export function navbarMenuItem(id: string): string {
  return `[data-testid="dsh-navbar-item-${id}"]`
}

/** 菜单项 testid 的前缀，用于从 `data-testid` 反推菜单项 id。 */
export const NAVBAR_MENU_ITEM_PREFIX = 'dsh-navbar-item-'

/** 装配失败页根节点（`src/layout/components/setup.tsx` → `Loadable`）。 */
export const SETUP_ERROR = '[data-testid="dsh-setup-error"]'

/** 「下载已被环境禁用」页根节点；`DSH_E2E_DISABLE_DOWNLOAD=1` 时替代失败页。 */
export const SETUP_DISABLED = '[data-testid="dsh-setup-disabled"]'

/**
 * 首次装配「安装推荐插件」引导页的跳过按钮。
 *
 * 三处（有变更 / 无变更 / 安装失败）互斥渲染，因此同一 testid 只会命中一个。
 */
export const SETUP_PREINSTALL_SKIP = '[data-testid="dsh-setup-preinstall-skip"]'

/** 配置对话框根节点（`Modal.Dialog`）。 */
export const CONFIG_DIALOG = '[data-testid="dsh-config-dialog"]'

/** 配置对话框关闭触发器。 */
export const CONFIG_DIALOG_CLOSE = '[data-testid="dsh-config-dialog-close"]'

/** 配置对话框右侧面板的滚动容器。 */
export const CONFIG_PANEL_BODY = '[data-testid="dsh-config-panel-body"]'

/** 当前面板自持的标题（各面板 `Panel.Header`）。 */
export const CONFIG_PANEL_TITLE = '[data-testid="dsh-config-panel-title"]'

/** 「插件」导航项上的异常角标。 */
export const CONFIG_NAV_PLUGINS_BADGE = '[data-testid="dsh-config-nav-plugins-badge"]'

/** 四个面板标识，顺序即左侧导航渲染顺序。 */
export const CONFIG_TABS = ['application', 'profiles', 'plugins', 'harness'] as const

/** 单个左侧导航项的选择器；`tab` 取 `ConfigTab` 值域。 */
export function configNav(tab: string): string {
  return `[data-testid="dsh-config-nav-${tab}"]`
}

/**
 * 导航项选中态标记。选中项带 `aria-current="true"`，其余不渲染该属性——
 * 选中态只此一处机器可读，不得依赖 `bg-background-secondary` 等类名。
 */
export const CONFIG_NAV_SELECTED_ATTR = 'aria-current'

/**
 * 「应用」面板的语言下拉触发器（`Select.Trigger`）。触发器文本即当前语言文案，
 * 因此「读取当前值」与「点击展开」共用同一个观察点。
 */
export const CONFIG_LANGUAGE_SELECT = '[data-testid="dsh-config-language-select"]'

/** 语言下拉的两个选项；规范禁止文本定位，选项必须可被 testid 命中。 */
export const CONFIG_LANGUAGE_OPTION_ZH = '[data-testid="dsh-config-language-option-zh"]'
export const CONFIG_LANGUAGE_OPTION_EN = '[data-testid="dsh-config-language-option-en"]'

/** 语言标识（与 i18n 资源、`localStorage` 中记录的值一致）。 */
export const LANGUAGES = ['zh-CN', 'en-US'] as const
export type Language = typeof LANGUAGES[number]

/** 单个语言选项的选择器。 */
export function configLanguageOption(language: Language): string {
  return language === 'zh-CN' ? CONFIG_LANGUAGE_OPTION_ZH : CONFIG_LANGUAGE_OPTION_EN
}

/** i18n 持久化 key（`src/i18n/index.detector.ts:7`）。 */
export const LANGUAGE_STORAGE_KEY = 'deepseek-harness-desktop-language'
