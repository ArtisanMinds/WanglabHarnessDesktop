/**
 * L3 桌面端用例共享的 `data-testid` 选择器常量。
 *
 * 规范见 `docs/specs/desktop.test.md` §5：用例只认 `dsh-<业务域>-<元素名>`，
 * 禁止依赖 CSS 类名、DOM 层级或文本内容；跨用例复用的选择器一律登记在此。
 */

/** 壳层根节点（`src/layout/index.tsx`）。 */
export const SHELL_ROOT = '[data-testid="dsh-shell-root"]'

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
