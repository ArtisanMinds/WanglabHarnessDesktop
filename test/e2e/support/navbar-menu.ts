/**
 * L3 桌面端用例共享的导航栏下拉菜单操作。
 *
 * 菜单由 react-aria 承载，两处非直觉行为写在这里，调用方不必各自踩一遍：
 * - 收起一律走 Escape：菜单展开时会铺一层全屏 `data-testid="underlay"`
 *   （`position: fixed` + `pointer-events: auto`）接管外部点击，触发器与导航栏都被遮住，
 *   再点一次既不可靠也过不了 WebdriverIO 的「被遮挡即不可点击」判定。
 * - 菜单项先入 DOM、焦点后落到 `role="menu"`；焦点未就位就发键会被菜单丢掉（实测竞态）。
 */

import { NAVBAR_MENU_ITEM_PREFIX, NAVBAR_MENU_ITEMS } from './selectors'

/** 展开中菜单的快照：id / 文案 / 是否禁用，顺序即渲染顺序。 */
export interface MenuSnapshot {
  ids: string[]
  texts: string[]
  disabled: Record<string, boolean>
}

/** 展开中菜单的渲染几何：弹层宽度与每个菜单项的宽度 / 文本是否被裁切。 */
export interface MenuGeometry {
  popoverWidth: number
  items: { id: string, width: number, clipped: boolean }[]
}

/** 展开中的菜单项数量。WDIO 的 `ChainablePromiseArray.length` 本身是 Promise，需二次 await。 */
export async function menuItemCount(browser: WebdriverIO.Browser): Promise<number> {
  return await (await browser.$$(NAVBAR_MENU_ITEMS)).length
}

/** 点击触发器展开菜单，并等到焦点落到菜单上。 */
export async function openMenu(browser: WebdriverIO.Browser, trigger: string): Promise<void> {
  const button = await browser.$(trigger)
  await button.waitForClickable()
  await button.click()
  await browser.waitUntil(async () => (await menuItemCount(browser)) > 0, {
    timeout: 5_000,
    timeoutMsg: `菜单未展开：${trigger}`,
  })
  await browser.waitUntil(
    () => browser.execute(() => document.activeElement?.getAttribute('role') === 'menu'),
    { timeout: 5_000, timeoutMsg: `菜单未获得焦点：${trigger}` },
  )
}

/** 用 Escape 收起菜单，并等到菜单项全部离场。 */
export async function closeMenu(browser: WebdriverIO.Browser): Promise<void> {
  await browser.keys(['Escape'])
  await browser.waitUntil(async () => (await menuItemCount(browser)) === 0, {
    timeout: 5_000,
    timeoutMsg: '菜单未收起（Escape）',
  })
}

/** 读取展开中菜单的「id / 文案 / 是否禁用」，顺序即渲染顺序。 */
export async function readMenu(browser: WebdriverIO.Browser): Promise<MenuSnapshot> {
  const ids: string[] = []
  const texts: string[] = []
  const disabled: Record<string, boolean> = {}

  for (const item of await browser.$$(NAVBAR_MENU_ITEMS)) {
    // id 从 testid 反推（`dsh-navbar-item-<id>`），不再依赖 react-aria 的 `data-key`
    const testid = (await item.getAttribute('data-testid')) ?? ''
    const id = testid.startsWith(NAVBAR_MENU_ITEM_PREFIX)
      ? testid.slice(NAVBAR_MENU_ITEM_PREFIX.length)
      : testid
    ids.push(id)
    texts.push((await item.getText()).trim())
    disabled[id] = (await item.getAttribute('aria-disabled')) === 'true'
      || (await item.getAttribute('data-disabled')) === 'true'
  }

  return { ids, texts, disabled }
}

/** 读取展开中菜单的渲染几何：弹层宽度与每个菜单项的宽度 / 文本是否被裁切。 */
export function readMenuGeometry(browser: WebdriverIO.Browser): Promise<MenuGeometry> {
  return browser.execute((itemPrefix: string) => {
    const popover = document.querySelector('[data-testid="dsh-navbar-menu-popover"]')
    const nodes = Array.from(document.querySelectorAll(`[data-testid^="${itemPrefix}"]`)) as HTMLElement[]
    return {
      popoverWidth: popover ? Math.round(popover.getBoundingClientRect().width) : 0,
      items: nodes.map((node) => {
        const testid = node.getAttribute('data-testid') ?? ''
        return {
          id: testid.startsWith(itemPrefix) ? testid.slice(itemPrefix.length) : testid,
          width: Math.round(node.getBoundingClientRect().width),
          clipped: node.scrollWidth > node.clientWidth + 1,
        }
      }),
    }
  }, NAVBAR_MENU_ITEM_PREFIX)
}
