/**
 * 配置对话框的打开/关闭编排。
 *
 * 对话框是 `04`–`16` 多数用例的前置，这里收敛两处环境竞态（G-D03-7）：
 * - overlastic 的退场窗口（`duration = 300`）内重开，会与上一个 overlay 实例的
 *   `vanish()` 竞争，新对话框刚挂载就被摘掉；
 * - 节点被替换后元素句柄游离，而 `waitForClickable()` 只认首次取到的句柄，
 *   不会重新定位，必然轮询到超时。
 */

import { clickWhenReady, openMenu } from './navbar-menu'
import {
  CONFIG_DIALOG,
  CONFIG_DIALOG_CLOSE,
  NAVBAR_MENU_CONFIG,
  NAVBAR_ROOT,
  navbarMenuItem,
  SETUP_DISABLED,
  SETUP_ERROR,
} from './selectors'

/** 页面级标记：用来区分「弹层被收起」与「整个 webview 被重新加载」。 */
export const CONFIG_DIALOG_PAGE_MARK = '__dshE2eConfigDialogMark'

export async function markConfigDialogPage(browser: WebdriverIO.Browser): Promise<void> {
  await browser.execute((markKey: string) => {
    (window as unknown as Record<string, unknown>)[markKey] = 1
  }, CONFIG_DIALOG_PAGE_MARK)
}

/** 失败时的现场快照；只看错误信息无法区分「弹层被收起」和「页面被重新加载」。 */
export async function configShellState(browser: WebdriverIO.Browser): Promise<string> {
  return await browser.execute((selectors: Record<string, string>, markKey: string) => {
    const has = (selector: string) => Boolean(document.querySelector(selector))
    const marked = (window as unknown as Record<string, unknown>)[markKey] === 1
    return [
      `navbar=${has(selectors.navbar)}`,
      `dialog=${has(selectors.dialog)}`,
      `disabledPage=${has(selectors.disabled)}`,
      `errorPage=${has(selectors.error)}`,
      `pageMark=${marked}`,
      `url=${location.href}`,
    ].join(' ')
  }, { navbar: NAVBAR_ROOT, dialog: CONFIG_DIALOG, disabled: SETUP_DISABLED, error: SETUP_ERROR }, CONFIG_DIALOG_PAGE_MARK)
}

export async function isConfigDialogOpen(browser: WebdriverIO.Browser): Promise<boolean> {
  const dialog = await browser.$(CONFIG_DIALOG)
  return await dialog.isExisting() && await dialog.isDisplayed()
}

/**
 * 打开「配置」菜单并选择目标面板；菜单项点击后对话框才挂载。
 *
 * 对「打开后立刻被收起」重试一次（仓库「少量重试」约定），其余断言保持严格口径。
 */
export async function openConfigTab(browser: WebdriverIO.Browser, tab: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await openMenu(browser, NAVBAR_MENU_CONFIG)
    await clickWhenReady(browser, navbarMenuItem(tab))

    const dialog = await browser.$(CONFIG_DIALOG)
    await dialog.waitForDisplayed({ timeout: 10_000 })

    await browser.pause(400)
    if (await isConfigDialogOpen(browser))
      return
  }
  throw new Error(`配置对话框打开后立即被收起（重试后仍失败）：${tab}；现场：${await configShellState(browser)}`)
}

/**
 * 收起对话框并等它真正离开 DOM。
 *
 * `isDisplayed()` 为假只说明弹层开始退场，overlastic 的 `vanish()` 尚未执行；
 * 此时重开会与上一个实例的卸载竞争（G-D03-7），因此必须等节点从 DOM 卸载
 * 并排空退场窗口。
 */
export async function closeConfigDialog(browser: WebdriverIO.Browser): Promise<void> {
  await clickWhenReady(browser, CONFIG_DIALOG_CLOSE)
  await browser.waitUntil(async () => !(await isConfigDialogOpen(browser)), {
    timeout: 10_000,
    timeoutMsg: '配置对话框未关闭',
  })
  await browser.waitUntil(async () => !(await (await browser.$(CONFIG_DIALOG)).isExisting()), {
    timeout: 10_000,
    timeoutMsg: '配置对话框未从 DOM 卸载',
  })
  await browser.pause(400)
}
