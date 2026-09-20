/**
 * L3 桌面端 E2E：壳层导航栏。
 *
 * 用例来源：docs/testing/desktop/02-shell-navigation.md，一个 `it()` 对应一条用例。
 * 编排：test/e2e/support/desktop-host.ts
 *
 * 运行：pnpm test:e2e:desktop -- --run test/e2e/desktop/02-shell-navigation.e2e.ts
 *   前置：`dist/` 已由 `vite build` 产出，且 Debug 二进制经
 *         `tauri build --debug --no-bundle` 构建（必须带 custom-protocol，否则走 devUrl）。
 *
 * 本批只验壳层（导航栏结构与条件渲染），不触达装配流程：以 `disableDownload: true`
 * 启动，应用在隔离 home 下自然停在「无 iframe 接收方」的状态（预装引导或错误页），
 * 导航栏照常渲染——这正是条件渲染要覆盖的形态。TC-013（iframe 回报折叠状态）需要
 * 真实就绪的 iframe，TC-014（`dsh-tauri` 未安装）需要插件安装夹具，二者见文档 §7。
 */

import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDesktopApp } from '../support/desktop-host'
import {
  NAVBAR_DRAG_REGION,
  NAVBAR_MENU_CONFIG,
  NAVBAR_MENU_FILE,
  NAVBAR_MENU_HELP,
  NAVBAR_ROOT,
  SETUP_DISABLED,
  SETUP_ERROR,
} from '../support/selectors'

/** 展开中的下拉菜单项（react-aria 把集合 key 落在 `data-key` 上）。 */
const MENU_ITEM = '[role="menuitem"]'

/**
 * 「配置」菜单项文案。与 `src/i18n/locales/*.json` 的 `config.*` 一致，
 * 按设备语言（与 `src/i18n/index.detector.ts` 同一条判定）取用。
 */
const CONFIG_TAB_TEXTS: Record<string, string[]> = {
  'zh-CN': ['应用', '档案', '插件', '核心'],
  'en-US': ['Application', 'Profiles', 'Plugins', 'Harness'],
}

function expectedConfigTexts(locale: string): string[] {
  return locale.toLowerCase().startsWith('zh') ? CONFIG_TAB_TEXTS['zh-CN'] : CONFIG_TAB_TEXTS['en-US']
}

/** 「下载已被环境禁用」页标题（`status.download_disabled`）。 */
const DOWNLOAD_DISABLED_TITLES: Record<string, string> = {
  'zh-CN': '下载已被环境禁用',
  'en-US': 'Downloads disabled by environment',
}

/** 环境变量名，两个语种的说明文案里都出现，用它作为「确实是禁用页」的稳定标记。 */
const DISABLE_ENV_MARKER = 'DSH_E2E_DISABLE_DOWNLOAD=1'

let browser: WebdriverIO.Browser
let stop: () => Promise<void>

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 展开中的菜单项数量。WDIO 的 `ChainablePromiseArray.length` 本身是 Promise，需二次 await。 */
async function menuItemCount(): Promise<number> {
  return await (await browser.$$(MENU_ITEM)).length
}

async function openMenu(trigger: string): Promise<void> {
  const button = await browser.$(trigger)
  await button.waitForClickable()
  await button.click()
  await browser.waitUntil(async () => (await menuItemCount()) > 0, {
    timeout: 5_000,
    timeoutMsg: `菜单未展开：${trigger}`,
  })
  // 菜单项先入 DOM、焦点后落到 `role="menu"`；Escape 由菜单自身消费，
  // 焦点未就位就发键会被丢掉（实测的竞态）。
  await browser.waitUntil(
    () => browser.execute(() => document.activeElement?.getAttribute('role') === 'menu'),
    { timeout: 5_000, timeoutMsg: `菜单未获得焦点：${trigger}` },
  )
}

/**
 * 收起菜单用 Escape 而不是再点一次触发器：菜单展开时 react-aria 会铺一层
 * 全屏 `data-testid="underlay"`（`position: fixed` + `pointer-events: auto`）
 * 接管外部点击，触发器和导航栏都被它遮住，第二次点击既不可靠也过不了
 * WebdriverIO 的「被遮挡即不可点击」判定。
 */
async function closeMenu(): Promise<void> {
  await browser.keys(['Escape'])
  await browser.waitUntil(async () => (await menuItemCount()) === 0, {
    timeout: 5_000,
    timeoutMsg: '菜单未收起（Escape）',
  })
}

/** 读取展开中菜单的「id / 文案 / 是否禁用」，顺序即渲染顺序。 */
async function readMenu(): Promise<{ ids: string[], texts: string[], disabled: Record<string, boolean> }> {
  const ids: string[] = []
  const texts: string[] = []
  const disabled: Record<string, boolean> = {}

  for (const item of await browser.$$(MENU_ITEM)) {
    const id = (await item.getAttribute('data-key')) ?? ''
    ids.push(id)
    texts.push((await item.getText()).trim())
    disabled[id] = (await item.getAttribute('aria-disabled')) === 'true'
      || (await item.getAttribute('data-disabled')) === 'true'
  }

  return { ids, texts, disabled }
}

/** 读取展开中菜单的渲染几何：弹层宽度与每个菜单项的宽度 / 文本是否被裁切。 */
async function readMenuGeometry(): Promise<{
  popoverWidth: number
  items: { id: string, width: number, clipped: boolean }[]
}> {
  return browser.execute(() => {
    const menu = document.querySelector('[role="menu"]')
    const popover = menu?.closest('[class*="popover"]')
    return {
      popoverWidth: popover ? Math.round(popover.getBoundingClientRect().width) : 0,
      items: Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => {
        const node = el as HTMLElement
        return {
          id: node.getAttribute('data-key') ?? '',
          width: Math.round(node.getBoundingClientRect().width),
          clipped: node.scrollWidth > node.clientWidth + 1,
        }
      }),
    }
  })
}

/** 窗口是否处于最大化（Tauri window 插件，主窗口 label 固定为 `main`）。 */
async function isMaximized(): Promise<boolean> {
  // 脚本内 `invoke` 是异步的，`execute` 的返回类型因此是 Promise<Promise<boolean>>；
  // 运行时 WebDriver 会等脚本返回的 promise 落定，这里 await 两次把类型也对齐。
  return await browser.execute(async () => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<boolean> }
    }).__TAURI_INTERNALS__
    return await internals.invoke('plugin:window|is_maximized', { label: 'main' })
  })
}

/**
 * 派发拖拽区的双击序列事件。
 *
 * 驱动层限制：embedded WebDriver 的 `doubleClick()` 产生的 `mousedown` 的
 * `detail` 恒为 0、且完全不派发 `dblclick`，Tauri 原生拖拽区赖以判定双击的
 * `detail === 2` 永远命中不了（与 G-D01-4 同类的通道限制）。因此这里直接派发
 * 原生处理器（`tauri/src/window/scripts/drag.js`）实际依据的两个事件。
 */
function dispatchDragRegion(event: 'mousedown' | 'dblclick'): Promise<void> {
  return browser.execute((type) => {
    const region = document.querySelector('[data-testid="dsh-navbar-drag-region"]')!
    region.dispatchEvent(new MouseEvent(type, { bubbles: true, detail: 2, button: 0 }))
  }, event)
}

/**
 * macOS 上「文件」「配置」「帮助」三个菜单整组不渲染（由原生菜单栏承载，
 * 见 `navbar.tsx:374`），本批全部用例只适用于 Windows / Linux（文档 §7 假设）。
 */
describe.skipIf(process.platform === 'darwin')('壳层导航栏', () => {
  beforeAll(async () => {
    const app = await startDesktopApp({ disableDownload: true })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
  })

  afterAll(async () => {
    await stop?.()
  })

  it('TC-DSK-L3-02-001 验证导航栏根容器与三个菜单按钮存在', async () => {
    const navbar = await browser.$(NAVBAR_ROOT)
    await navbar.waitForDisplayed()

    for (const trigger of [NAVBAR_MENU_FILE, NAVBAR_MENU_CONFIG, NAVBAR_MENU_HELP]) {
      const button = await browser.$(trigger)
      await button.waitForDisplayed()
      expect(await button.isDisplayed(), `菜单触发器不可见：${trigger}`).toBe(true)
    }
  })

  it('TC-DSK-L3-02-002 验证「配置」菜单包含四个面板入口', async () => {
    const locale = await browser.execute(() => navigator.language) as string

    await openMenu(NAVBAR_MENU_CONFIG)
    const menu = await readMenu()
    await closeMenu()

    expect(menu.ids).toEqual(['application', 'profiles', 'plugins', 'harness'])
    expect(menu.texts).toEqual(expectedConfigTexts(locale))
  })

  it('TC-DSK-L3-02-003 验证「帮助」菜单包含四个入口', async () => {
    await openMenu(NAVBAR_MENU_HELP)
    const menu = await readMenu()
    await closeMenu()

    expect(menu.ids).toEqual(['copy-run-logs', 'check-update', 'about', 'documentation'])
  })

  it('TC-DSK-L3-02-004 验证「文件」菜单包含五个入口', async () => {
    await openMenu(NAVBAR_MENU_FILE)
    const menu = await readMenu()
    await closeMenu()

    expect(menu.ids).toEqual(['new-window', 'new-chat', 'open-folder', 'close', 'quit'])
  })

  it('TC-DSK-L3-02-007 [反向] 验证无 iframe 接收方时依赖项禁用', async () => {
    const hasIframe = await browser.execute(() => document.querySelector('iframe') != null)
    expect(hasIframe, '本用例要求 iframe 未挂载（无协议接收方）').toBe(false)

    await openMenu(NAVBAR_MENU_FILE)
    const menu = await readMenu()
    await closeMenu()

    expect(menu.disabled['new-chat']).toBe(true)
    expect(menu.disabled['open-folder']).toBe(true)
  })

  it('TC-DSK-L3-02-008 验证拖拽区双击切换最大化', async () => {
    const region = await browser.$(NAVBAR_DRAG_REGION)
    await region.waitForDisplayed()
    expect(await isMaximized()).toBe(false)

    await dispatchDragRegion('mousedown')
    await browser.waitUntil(async () => await isMaximized(), {
      timeout: 10_000,
      timeoutMsg: '拖拽区双击序列未使窗口最大化',
    })

    // 真实双击除 mousedown(detail=2) 外还会派发 dblclick；网页侧若也挂了
    // onDoubleClick，两次切换会互相抵消。这里守住「只有原生一侧切换」。
    await dispatchDragRegion('dblclick')
    await sleep(500)
    expect(await isMaximized(), 'dblclick 不应再切换一次（网页侧不得重复处理）').toBe(true)

    await dispatchDragRegion('mousedown')
    await browser.waitUntil(async () => !(await isMaximized()), {
      timeout: 10_000,
      timeoutMsg: '拖拽区双击序列未还原窗口',
    })
  })

  it('TC-DSK-L3-02-010 验证窄视口下菜单项文本不被裁切', async () => {
    // HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 里给 min-width，
    // 视口 ≥ 768px 时任何被钉死的 width 都会被 min-width 盖住、缺陷被掩盖；
    // 只有把 CSS 视口压到 48rem 以下才能复现（高显示缩放下的日常形态，见 G-D02-7）。
    await browser.setWindowSize(720, 640)
    await browser.waitUntil(
      () => browser.execute(() => window.innerWidth < 768),
      { timeout: 10_000, timeoutMsg: '窗口未能缩到 48rem 以下，本用例的复现条件不成立' },
    )
    const viewport = await browser.execute(() => window.innerWidth) as number

    for (const trigger of [NAVBAR_MENU_FILE, NAVBAR_MENU_CONFIG, NAVBAR_MENU_HELP]) {
      await openMenu(trigger)
      const geometry = await readMenuGeometry()
      await closeMenu()

      expect(geometry.items.length, `菜单项缺失：${trigger}`).toBeGreaterThan(0)
      // 只断言「文本没被裁切」这一不变量：弹层宽度下有壳层的 `min-w-55`（220px）、
      // 上有 HeroUI 的 `max-width: 48svw`，视口极窄时上限会先咬住（CI 上实测弹层
      // 199px 且未裁切）。钉死宽度的回归（G-D02-7）必然表现为裁切，仍被本条捕获。
      expect(geometry.popoverWidth, `菜单弹层宽度为 0：${trigger}（视口 ${viewport}px）`).toBeGreaterThan(0)
      for (const item of geometry.items) {
        expect(item.width, `菜单项宽度为 0：${trigger} → ${item.id}`).toBeGreaterThan(0)
        expect(
          item.clipped,
          `菜单项文本被裁切：${trigger} → ${item.id}（弹层 ${geometry.popoverWidth}px，视口 ${viewport}px）`,
        ).toBe(false)
      }
    }

    await browser.setWindowSize(1280, 840)
  })

  it('TC-DSK-L3-02-011 验证禁用下载时展示禁用页而非启动失败页', async () => {
    // 本批以 `disableDownload: true` 启动，装配必然停在「找不到 dsh CLI」。
    // 那是被刻意截断的结果：壳层应渲染「下载已被环境禁用」页，而不是启动失败页。
    const disabled = await browser.$(SETUP_DISABLED)
    await disabled.waitForDisplayed({ timeout: 120_000 })

    expect(await (await browser.$(SETUP_ERROR)).isExisting(), '不应渲染启动失败页').toBe(false)

    const locale = await browser.execute(() => navigator.language) as string
    const title = locale.toLowerCase().startsWith('zh')
      ? DOWNLOAD_DISABLED_TITLES['zh-CN']
      : DOWNLOAD_DISABLED_TITLES['en-US']
    // 断言前统一去空白：`getText` 的换行/空格随语言与折行变化，英文标题自带空格。
    const compact = (value: string) => value.replace(/\s+/g, '')
    const text = compact(await disabled.getText())

    expect(text).toContain(compact(title))
    expect(text).toContain(DISABLE_ENV_MARKER)
  })
})
