/**
 * L3 桌面端 E2E：配置对话框容器。
 *
 * 用例来源：docs/testing/desktop/03-config-dialog.md，一个 `it()` 对应一条用例。
 * 编排：test/e2e/support/desktop-host.ts；菜单操作：test/e2e/support/navbar-menu.ts
 *
 * 运行：pnpm test:e2e:desktop -- --run test/e2e/desktop/03-config-dialog.e2e.ts
 *   前置：`dist/` 已由 `vite build` 产出，且 Debug 二进制经
 *         `tauri build --debug --no-bundle` 构建（必须带 custom-protocol，否则走 devUrl）。
 *
 * 本批只验容器行为（打开 / 定位 / 切换 / 关闭 / 尺寸），各面板内部行为归 04/05/09/14。
 * 以 `disableDownload: true` 启动：容器与四个面板的标题都不依赖装配完成。
 * TC-005（重启前命令式收起）需服务处于运行中、TC-006（异常角标）需带 `error` 的插件夹具，
 * 二者见文档 §7。
 */

import process from 'node:process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  closeConfigDialog,
  configShellState,
  isConfigDialogOpen,
  markConfigDialogPage,
  openConfigTab,
} from '../support/config-dialog'
import { startDesktopApp } from '../support/desktop-host'
import {
  CONFIG_DIALOG,
  CONFIG_NAV_SELECTED_ATTR,
  CONFIG_PANEL_BODY,
  CONFIG_PANEL_TITLE,
  CONFIG_TABS,
  configNav,
  NAVBAR_ROOT,
} from '../support/selectors'

/**
 * 各面板**自持**的标题文案（`Panel.Header`），与 `src/i18n/locales/*.json` 一致：
 * 「应用」用 `config.application`，其余三个面板各有自己的标题键（与导航项文案不必相同）。
 */
const PANEL_TITLES: Record<string, Record<string, string>> = {
  'zh-CN': {
    application: '应用',
    profiles: '档案',
    plugins: '已安装插件',
    harness: '核心引擎',
  },
  'en-US': {
    application: 'Application',
    profiles: 'Profiles',
    plugins: 'Installed Plugins',
    harness: 'Harness Core',
  },
}

interface DialogBox {
  viewportWidth: number
  viewportHeight: number
  width: number
  height: number
  bodyOverflowY: string
  pageScrollHeight: number
}

let browser: WebdriverIO.Browser
let stop: () => Promise<void>

function expectedTitles(locale: string): Record<string, string> {
  return locale.toLowerCase().startsWith('zh') ? PANEL_TITLES['zh-CN'] : PANEL_TITLES['en-US']
}

async function deviceLocale(): Promise<string> {
  return await browser.execute(() => navigator.language) as string
}

/** 点击导航项：每次轮询都重新查询元素。 */
async function clickNav(tab: string): Promise<void> {
  // `waitForClickable()` 只认首次取到的句柄，句柄一旦游离就永远轮询到超时；
  // 对话框重渲染会换掉按钮节点，因此这里自己轮询、每次都重新定位。
  await browser.waitUntil(async () => {
    const node = await browser.$(configNav(tab))
    return await node.isExisting() && await node.isClickable()
  }, { timeout: 10_000, timeoutMsg: `导航项不可点击：${tab}` })

  const node = await browser.$(configNav(tab))
  await node.click()
}

/** 四个导航项的选中态。选中态只认 `aria-current`，不得依赖高亮类名。 */
async function readNavStates(): Promise<Record<string, boolean>> {
  const states: Record<string, boolean> = {}
  for (const tab of CONFIG_TABS) {
    const node = await browser.$(configNav(tab))
    states[tab] = (await node.getAttribute(CONFIG_NAV_SELECTED_ATTR)) === 'true'
  }
  return states
}

/** 当前面板标题（由被渲染的那个面板自己给出）。 */
async function panelTitle(): Promise<string> {
  const titles = await browser.$$(CONFIG_PANEL_TITLE)
  expect(await titles.length, '面板标题元素数量不为 1（Switch 未独占渲染？）').toBe(1)
  const node = await browser.$(CONFIG_PANEL_TITLE)
  await node.waitForDisplayed({ timeout: 10_000 })
  return (await node.getText()).trim()
}

/** 视口与对话框边界（CSS 像素），并顺带读回内部滚动容器的溢出策略与页面总高。 */
function readDialogBox(): Promise<DialogBox> {
  return browser.execute((dialogSelector: string, bodySelector: string) => {
    const dialog = document.querySelector(dialogSelector) as HTMLElement
    const rect = dialog.getBoundingClientRect()
    const body = dialog.querySelector(bodySelector) as HTMLElement | null
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      width: rect.width,
      height: rect.height,
      bodyOverflowY: body ? getComputedStyle(body).overflowY : '',
      pageScrollHeight: document.documentElement.scrollHeight,
    }
  }, CONFIG_DIALOG, CONFIG_PANEL_BODY)
}

/**
 * 等对话框尺寸稳定。
 *
 * HeroUI 的 `modal__container` 带入场缩放动画（`matrix3d(scale)`，起手约 1.03 再收到 1），
 * 动画期间 `getBoundingClientRect()` 会整体放大最多 ~3%，把「宽度恰好等于 `max-w`」读成溢出。
 * 这里不依赖动画实现，只等两次采样一致。
 */
async function waitForDialogSettled(): Promise<void> {
  let previous = Number.NaN
  try {
    await browser.waitUntil(async () => {
      const width = await browser.execute((dialogSelector: string) => {
        const dialog = document.querySelector(dialogSelector) as HTMLElement | null
        return dialog ? dialog.getBoundingClientRect().width : Number.NaN
      }, CONFIG_DIALOG) as number
      const settled = Number.isFinite(previous) && Math.abs(width - previous) < 0.5
      previous = width
      return settled
    }, { timeout: 10_000, interval: 150, timeoutMsg: '对话框尺寸未稳定（入场动画未结束？）' })
  }
  catch (err) {
    throw new Error(`${(err as Error).message}；现场：${await configShellState(browser)}`)
  }
}

/**
 * 尺寸上限：宽 ≤ 视口宽 − 48、高 ≤ 视口高 − 96（`config.tsx` 的 `max-w` / `h` 同源）。
 * 上限由 `calc(100vw - 48px)` 精确给出，`getBoundingClientRect` 在非整数缩放下回传小数，
 * 按 1px 容差判定，避免把取整误差当成溢出。
 */
function expectWithinViewport(box: DialogBox): void {
  const seen = `dialog=${Math.round(box.width)}×${Math.round(box.height)} viewport=${box.viewportWidth}×${box.viewportHeight}`
  expect(box.width, `对话框宽度超出视口上限：${seen}`).toBeLessThanOrEqual(box.viewportWidth - 48 + 1)
  expect(box.height, `对话框高度超出视口上限：${seen}`).toBeLessThanOrEqual(box.viewportHeight - 96 + 1)
}

describe.skipIf(process.platform === 'darwin')('配置对话框', () => {
  beforeAll(async () => {
    const app = await startDesktopApp({ disableDownload: true })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
    // 页面级标记：整个用例期间都应存在，用来区分「弹层被收起」与「webview 被重载」
    await markConfigDialogPage(browser)
  })

  afterAll(async () => {
    await stop?.()
  })

  // 每条用例自带开/关，不依赖上一条留下的对话框状态
  afterEach(async () => {
    if (await isConfigDialogOpen(browser))
      await closeConfigDialog(browser)
  })

  it('TC-DSK-L3-03-001 验证「配置 → 应用」打开对话框并默认定位「应用」面板', async () => {
    const titles = expectedTitles(await deviceLocale())

    await openConfigTab(browser, 'application')

    expect(await isConfigDialogOpen(browser), '对话框未打开').toBe(true)
    expect(await readNavStates()).toEqual({
      application: true,
      profiles: false,
      plugins: false,
      harness: false,
    })
    const title = await panelTitle()
    expect(title, '面板标题为空').not.toBe('')
    expect(title).toBe(titles.application)
  })

  it('TC-DSK-L3-03-002 验证左侧导航可切换四个面板', async () => {
    const titles = expectedTitles(await deviceLocale())

    await openConfigTab(browser, 'application')

    for (const tab of CONFIG_TABS) {
      await clickNav(tab)

      await browser.waitUntil(async () => (await readNavStates())[tab] === true, {
        timeout: 5_000,
        timeoutMsg: `导航项未切到选中态：${tab}`,
      })

      // 只有被点击项选中
      expect(await readNavStates()).toEqual({
        application: tab === 'application',
        profiles: tab === 'profiles',
        plugins: tab === 'plugins',
        harness: tab === 'harness',
      })
      // 标题随导航项一一对应，证明渲染的是该面板本体
      expect(await panelTitle(), `面板标题与导航项不符：${tab}`).toBe(titles[tab])
    }
  })

  it('TC-DSK-L3-03-003 验证从导航栏直接定位到指定面板', async () => {
    const titles = expectedTitles(await deviceLocale())

    for (const tab of ['profiles', 'plugins', 'harness', 'application']) {
      await openConfigTab(browser, tab)

      expect(await isConfigDialogOpen(browser), `对话框未打开：${tab}`).toBe(true)
      // 全程不点导航项：对话框出现后落点即目标面板
      expect(await panelTitle(), `未直接定位到目标面板：${tab}`).toBe(titles[tab])
      expect((await readNavStates())[tab], `导航项未选中：${tab}`).toBe(true)

      await closeConfigDialog(browser)
    }
  })

  it('TC-DSK-L3-03-004 验证关闭触发器关闭对话框且可再次打开', async () => {
    const titles = expectedTitles(await deviceLocale())

    await openConfigTab(browser, 'application')
    expect(await isConfigDialogOpen(browser)).toBe(true)

    await closeConfigDialog(browser)
    expect(await isConfigDialogOpen(browser), '关闭后对话框仍可见').toBe(false)

    await openConfigTab(browser, 'application')
    expect(await isConfigDialogOpen(browser), '对话框无法再次打开').toBe(true)
    // 新实例从 `props.tab` 起算，不残留上一次会话的面板
    expect(await panelTitle()).toBe(titles.application)
  })

  it('TC-DSK-L3-03-007 验证对话框尺寸不超出视口', async () => {
    const origin = await browser.getWindowSize()

    await openConfigTab(browser, 'application')

    await waitForDialogSettled()
    expectWithinViewport(await readDialogBox())

    // embedded driver 的 SetWindowRect 直接落 SetWindowPos，绕过 tao 的最小尺寸约束
    // （G-D01-4），因此这里能给到比真实最小尺寸（860×620）更窄的视口。
    // 默认窗口是 1280×840 **物理**像素（`builder.rs:485` 的 inner_size），CSS 视口随 dpr 变：
    // dpr=1.75 时为 732×481，此时 `w-[800px]`/`h-[720px]` 已经被 `calc(100vw-48px)` 夹住。
    await browser.setWindowSize(720, 640)
    await browser.waitUntil(
      () => browser.execute(() => window.innerWidth <= 720),
      { timeout: 10_000, timeoutMsg: '窗口未缩到窄视口，本用例的复现条件不成立' },
    )

    await waitForDialogSettled()
    const small = await readDialogBox()
    expectWithinViewport(small)
    // 窄视口下溢出必须由内部滚动容器接管：`overflow-auto` + `min-h-0`，
    // 而不是把对话框（或页面）撑高。
    expect(small.bodyOverflowY, '滚动容器未接管纵向溢出').toBe('auto')
    expect(
      small.pageScrollHeight,
      `对话框把页面撑高了：page=${small.pageScrollHeight} viewport=${small.viewportHeight}`,
    ).toBeLessThanOrEqual(small.viewportHeight + 1)

    await browser.setWindowSize(origin.width, origin.height)
  })
})
