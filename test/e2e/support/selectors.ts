/**
 * L3 桌面端用例共享的 `data-testid` 选择器常量。
 *
 * 规范见 `docs/testing/desktop/00-overview.md`：用例只认 `dsh-<业务域>-<元素名>`，
 * 禁止依赖 CSS 类名、DOM 层级或文本内容；跨用例复用的选择器一律登记在此。
 *
 * 桌面端只剩一条启动冒烟用例，因此这里只保留它真正用到的锚点；被删用例的选择器
 * 随用例一起移除，避免留下没有消费者的死常量。
 */

/** 壳层根节点（`src/layout/index.tsx`）。 */
export const SHELL_ROOT = '[data-testid="dsh-shell-root"]'

/**
 * 内嵌 dsh 页面的 iframe（`src/layout/components/iframe.tsx`）。
 *
 * 仅在 `harness.serviceHealthy` 为真时挂载；因此「iframe 出现」即「dsh 内核已起来」。
 */
export const SHELL_IFRAME = '[data-testid="dsh-shell-iframe"]'

/** 装配失败页根节点（`src/layout/components/setup.tsx` → `Loadable`）。 */
export const SETUP_ERROR = '[data-testid="dsh-setup-error"]'

/**
 * 首次装配「安装推荐插件」引导页的跳过按钮。
 *
 * 三处（有变更 / 无变更 / 安装失败）互斥渲染，因此同一 testid 只会命中一个。
 */
export const SETUP_PREINSTALL_SKIP = '[data-testid="dsh-setup-preinstall-skip"]'
