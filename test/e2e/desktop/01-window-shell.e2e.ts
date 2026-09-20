/**
 * L3 桌面端 E2E：主窗口与基础壳层 UI（批次 `01`）。
 *
 * 用例来源：docs/testing/desktop/01-window-shell.md，一个 `it()` 对应一条用例。
 * 编排：test/e2e/support/desktop-host.ts；菜单操作：test/e2e/support/navbar-menu.ts
 *
 * 运行：pnpm test:e2e:desktop -- --run test/e2e/desktop/01-window-shell.e2e.ts
 *   前置：`dist/` 已由 `vite build` 产出，且 Debug 二进制经
 *         `tauri build --debug --no-bundle` 构建（必须带 custom-protocol，否则走 devUrl）；
 *         3081 空闲；无残留桌面实例。
 *
 * 本文件**整批共用一个应用实例**：一次 `startDesktopApp()` 覆盖全部用例，批次合并的
 * 意义就在这里——不再按 describe 各自起一次应用。
 *
 * 本车道只验壳层（窗口、几何、导航栏结构与条件渲染），不触达装配流程：以
 * `disableDownload: true` 启动，应用在隔离 home 下自然停在「无 iframe 接收方」的状态
 * （预装引导或错误页），导航栏照常渲染——这正是条件渲染要覆盖的形态。
 * `01-013`（iframe 回报折叠状态）需要真实就绪的 iframe，`01-014`（`dsh-tauri` 未安装）
 * 需要插件安装夹具，二者见文档「缺口与假设」。
 */

import { existsSync } from 'node:fs'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  APP_PORT,
  APP_TITLE,
  assertPreconditions,
  defaultBinaryPath,
  startDesktopApp,
} from '../support/desktop-host'
import { closeMenu, openMenu, readMenu, readMenuGeometry } from '../support/navbar-menu'
import {
  NAVBAR_DEV_CHIP,
  NAVBAR_DRAG_REGION,
  NAVBAR_MENU_CONFIG,
  NAVBAR_MENU_FILE,
  NAVBAR_MENU_HELP,
  NAVBAR_ROOT,
  SETUP_DISABLED,
  SETUP_ERROR,
  SHELL_ROOT,
} from '../support/selectors'

/**
 * 控制台错误白名单（`01-window-shell.md` G-D01-2）。
 *
 * 只放与本用例断言目标无关、且在当前 WebView2 环境下稳定复现的噪声；
 * 新增条目必须写明来源，否则会把真实回归一起吞掉。
 */
const CONSOLE_ERROR_WHITELIST: readonly RegExp[] = [
  // WebView2 在无 GPU 的会话里会报这些，与壳层渲染无关。
  /GPU state invalid/i,
  /Autofill\./,
]

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

/** macOS 上「文件」「配置」「帮助」三个菜单整组不渲染（由原生菜单栏承载，见 `navbar.tsx:374`）。 */
const navOnly = it.skipIf(process.platform === 'darwin')

let browser: WebdriverIO.Browser
let stop: () => Promise<void>

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

describe('主窗口与基础壳层 UI', () => {
  beforeAll(async () => {
    // 本批只验壳层启动，不覆盖装配流程：选择禁用自动下载，避免每次运行都做联网
    // 版本核对。下载物另由 `DSH_DOWNLOAD_CACHE_DIR` 缓存复用；要测装配流程的用例
    // 需自行 `resetDownloadCache()` 并保持 `disableDownload: false`。
    const app = await startDesktopApp({ disableDownload: true })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
  })

  afterAll(async () => {
    await stop?.()
  })

  it('TC-DSK-L3-01-001 验证应用启动后主窗口存在且标题正确', async () => {
    // 应用同时会开桌宠窗口（webview `pet`），句柄列表是 `['main']` 还是 `['main','pet']`
    // 取决于桌宠窗口的创建时机——只断言主窗口在列且当前会话已切到它。
    const handles = await browser.getWindowHandles()
    expect(handles).toContain('main')

    const title = await browser.getTitle()
    expect(title).toBe(APP_TITLE)
  })

  it('TC-DSK-L3-01-002 验证壳层根节点渲染且页面无未捕获错误', async () => {
    const shell = await browser.$(SHELL_ROOT)
    await shell.waitForDisplayed()

    const errors: string[] = await browser.execute(() => {
      const collected = (window as unknown as { __e2eConsoleErrors?: string[] }).__e2eConsoleErrors ?? []
      return collected
    })

    const unexpected = errors.filter(message => !CONSOLE_ERROR_WHITELIST.some(re => re.test(message)))
    expect(unexpected).toEqual([])
  })

  it('TC-DSK-L3-01-003 验证壳层导航栏高度为 44px', async () => {
    const navbar = await browser.$(NAVBAR_ROOT)
    await navbar.waitForDisplayed()

    const height = await navbar.getSize('height')
    // 非 100% 显示缩放下 WebView2 回传的是物理像素换算回来的 CSS 像素，
    // 44 会变成 44.000003814697266（实测 175%），按亚像素容差判定。
    expect(height).toBeCloseTo(44, 3)
  })

  it('TC-DSK-L3-01-004 验证主窗口初始尺寸按 1280×840 申请', async () => {
    // `inner_size(1280, 840)` 是逻辑值，而 WebDriver 读回的 CSS 像素随显示器缩放
    // 变化：实测 150% 下 inner 为 854×560，×dpr 才还原成 1280（G-D01-1）。
    // `screen.*` 同样是 CSS 像素，故一并乘 dpr 换算到同一口径。
    const [innerWidth, innerHeight, dpr, screenW, screenH, availW, availH] = await browser.execute(() => [
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
      window.screen.width,
      window.screen.height,
      window.screen.availWidth,
      window.screen.availHeight,
    ]) as [number, number, number, number, number, number, number]

    const width = innerWidth * dpr
    const height = innerHeight * dpr
    const seen = `inner=${innerWidth}×${innerHeight} dpr=${dpr} screen=${screenW}×${screenH} avail=${availW}×${availH}`

    // 屏幕放不下时窗口会被系统夹小（CI 的虚拟显示器小于 1280×840，实测宽被夹到 1024），
    // 因此不能直接断言等于申请值，改为断言一对上下界：
    //   上限 = min(申请值, 屏幕)——应用不得自行放大，也不得越出显示器；
    //   下限 = min(申请值, 工作区)——屏幕放得下就必须给足；取工作区是因为任务栏会让
    //   可用高度小于屏幕高度，按工作区夹与按屏幕夹都应被判为合格。
    // ±2 为取整误差：CSS 像素是整数，150% 下 1280 只能表示成 854（×1.5 = 1281）。
    expect(width, `宽度超出上限：${seen}`).toBeLessThanOrEqual(Math.min(1_280, screenW * dpr) + 2)
    expect(width, `宽度不足下限：${seen}`).toBeGreaterThanOrEqual(Math.min(1_280, availW * dpr) - 2)
    expect(height, `高度超出上限：${seen}`).toBeLessThanOrEqual(Math.min(840, screenH * dpr) + 2)
    expect(height, `高度不足下限：${seen}`).toBeGreaterThanOrEqual(Math.min(840, availH * dpr) - 2)
  })

  // TC-DSK-L3-01-005（窗口最小尺寸约束 860×620）在本通道不可自动断言：
  // embedded driver 的 SetWindowRect 直接落 SetWindowPos，绕过 tao 的最小尺寸约束，
  // 请求 400×300 会真的变成 400×300。该用例已在文档中改标「否（手工）」，见 G-D01-4。

  it('TC-DSK-L3-01-006 验证生产构建不显示开发环境标记', async () => {
    // `01` 批次跑的是 `vite build` 产物，`import.meta.env.DEV` 为 false，
    // DEV 标记本就不应渲染。反向（dev 构建下可见）需 `tauri dev` 通道，见 G-D01-5。
    const chip = await browser.$(NAVBAR_DEV_CHIP)
    expect(await chip.isExisting()).toBe(false)
  })

  it('TC-DSK-L3-01-007 [反向] 验证二进制缺失时启动失败并给出可判定错误', async () => {
    const missing = `${defaultBinaryPath()}.__missing__`
    expect(existsSync(missing)).toBe(false)

    await expect(startDesktopApp({ appBinaryPath: missing, requireBinary: true })).rejects.toThrow(missing)
  })

  it('TC-DSK-L3-01-008 [反向] 验证默认端口被占用时前置校验直接失败且不强杀进程', async () => {
    const { createServer } = await import('node:net')
    const blocker = createServer()
    await new Promise<void>(resolvePromise => blocker.listen(APP_PORT, '127.0.0.1', resolvePromise))

    try {
      await expect(assertPreconditions({ port: APP_PORT })).rejects.toThrow(String(APP_PORT))
      // 占用者未被强杀：端口仍在监听。
      const stillListening = blocker.listening
      expect(stillListening).toBe(true)

      const recycled = await new Promise<boolean>((resolvePromise) => {
        const probe = createServer()
        probe.once('error', () => resolvePromise(false))
        probe.listen(APP_PORT, '127.0.0.1', () => {
          probe.close(() => resolvePromise(false))
          resolvePromise(true)
        })
      })
      expect(recycled).toBe(false)
    }
    finally {
      await new Promise<void>(resolvePromise => blocker.close(() => resolvePromise()))
    }
  })

  navOnly('TC-DSK-L3-01-009 验证导航栏根容器与三个菜单按钮存在', async () => {
    const navbar = await browser.$(NAVBAR_ROOT)
    await navbar.waitForDisplayed()

    for (const trigger of [NAVBAR_MENU_FILE, NAVBAR_MENU_CONFIG, NAVBAR_MENU_HELP]) {
      const button = await browser.$(trigger)
      await button.waitForDisplayed()
      expect(await button.isDisplayed(), `菜单触发器不可见：${trigger}`).toBe(true)
    }
  })

  navOnly('TC-DSK-L3-01-010 验证「配置」菜单包含四个面板入口', async () => {
    const locale = await browser.execute(() => navigator.language) as string

    await openMenu(browser, NAVBAR_MENU_CONFIG)
    const menu = await readMenu(browser)
    await closeMenu(browser)

    expect(menu.ids).toEqual(['application', 'profiles', 'plugins', 'harness'])
    expect(menu.texts).toEqual(expectedConfigTexts(locale))
  })

  navOnly('TC-DSK-L3-01-011 验证「帮助」菜单包含四个入口', async () => {
    await openMenu(browser, NAVBAR_MENU_HELP)
    const menu = await readMenu(browser)
    await closeMenu(browser)

    expect(menu.ids).toEqual(['copy-run-logs', 'check-update', 'about', 'documentation'])
  })

  navOnly('TC-DSK-L3-01-012 验证「文件」菜单包含五个入口', async () => {
    await openMenu(browser, NAVBAR_MENU_FILE)
    const menu = await readMenu(browser)
    await closeMenu(browser)

    expect(menu.ids).toEqual(['new-window', 'new-chat', 'open-folder', 'close', 'quit'])
  })

  navOnly('TC-DSK-L3-01-015 [反向] 验证无 iframe 接收方时依赖项禁用', async () => {
    const hasIframe = await browser.execute(() => document.querySelector('iframe') != null)
    expect(hasIframe, '本用例要求 iframe 未挂载（无协议接收方）').toBe(false)

    await openMenu(browser, NAVBAR_MENU_FILE)
    const menu = await readMenu(browser)
    await closeMenu(browser)

    expect(menu.disabled['new-chat']).toBe(true)
    expect(menu.disabled['open-folder']).toBe(true)
  })

  navOnly('TC-DSK-L3-01-016 验证拖拽区双击切换最大化', async () => {
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

  navOnly('TC-DSK-L3-01-018 验证窄视口下菜单项文本不被裁切', async () => {
    // HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 里给 min-width，
    // 视口 ≥ 768px 时任何被钉死的 width 都会被 min-width 盖住、缺陷被掩盖；
    // 只有把 CSS 视口压到 48rem 以下才能复现（高显示缩放下的日常形态，见 G-D01-12）。
    await browser.setWindowSize(720, 640)
    await browser.waitUntil(
      () => browser.execute(() => window.innerWidth < 768),
      { timeout: 10_000, timeoutMsg: '窗口未能缩到 48rem 以下，本用例的复现条件不成立' },
    )
    const viewport = await browser.execute(() => window.innerWidth) as number

    for (const trigger of [NAVBAR_MENU_FILE, NAVBAR_MENU_CONFIG, NAVBAR_MENU_HELP]) {
      await openMenu(browser, trigger)
      const geometry = await readMenuGeometry(browser)
      await closeMenu(browser)

      expect(geometry.items.length, `菜单项缺失：${trigger}`).toBeGreaterThan(0)
      // 只断言「文本没被裁切」这一不变量：弹层宽度下有壳层的 `min-w-55`（220px）、
      // 上有 HeroUI 的 `max-width: 48svw`，视口极窄时上限会先咬住（CI 上实测弹层
      // 199px 且未裁切）。钉死宽度的回归（G-D01-12）必然表现为裁切，仍被本条捕获。
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

  navOnly('TC-DSK-L3-01-019 验证禁用下载时展示禁用页而非启动失败页', async () => {
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
