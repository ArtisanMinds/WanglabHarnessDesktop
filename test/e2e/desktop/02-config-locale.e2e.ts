/**
 * L3 桌面端 E2E：配置管理与多语言主题（批次 `02`）。
 *
 * 用例来源：docs/testing/desktop/02-config-locale.md，一个 `it()` 对应一条用例。
 * 编排：test/e2e/support/desktop-host.ts；菜单操作：test/e2e/support/navbar-menu.ts；
 * 对话框生命周期：test/e2e/support/config-dialog.ts
 *
 * 运行：pnpm test:e2e:desktop -- --run test/e2e/desktop/02-config-locale.e2e.ts
 *   前置：`dist/` 已由 `vite build` 产出，且 Debug 二进制经
 *         `tauri build --debug --no-bundle` 构建（必须带 custom-protocol，否则走 devUrl）。
 *
 * 本文件**整批共用一个应用实例**：一次 `startDesktopApp()` 覆盖全部用例，批次合并的
 * 意义就在这里——不再按 describe 各自起一次应用。
 *
 * 整批走**真实装配车道**（不置 `disableDownload`）：`02-013` 要验 iframe，而 iframe 只在
 * `serviceHealthy` 时渲染，因此这一批统一按真实装配启动，`beforeAll` 里过一次预装引导
 * 并等 iframe 挂载。
 *
 * 只验容器与壳层状态（打开 / 定位 / 切换 / 关闭 / 尺寸、语言、主题），各面板内部行为归
 * 各自批次（`03` 档案、`05` 核心管理、`06` 插件面板）。
 * `02-005`（重启前命令式收起）需服务处于运行中、`02-006`（异常角标）需带 `error` 的插件
 * 夹具，二者见文档「缺口与假设」。
 */

import type { DesktopApp } from '../support/desktop-host'
import type { Language } from '../support/selectors'
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
import { clickWhenReady } from '../support/navbar-menu'
import { ensureShellInteractive as ensureNavbarClickable } from '../support/onboarding'
import { completePreinstall } from '../support/preinstall'
import {
  CONFIG_DIALOG,
  CONFIG_LANGUAGE_SELECT,
  CONFIG_NAV_SELECTED_ATTR,
  CONFIG_PANEL_BODY,
  CONFIG_PANEL_TITLE,
  CONFIG_TABS,
  configLanguageOption,
  configNav,
  LANGUAGE_STORAGE_KEY,
  NAVBAR_MENU_CONFIG,
  NAVBAR_MENU_FILE,
  NAVBAR_MENU_HELP,
  NAVBAR_ROOT,
  SHELL_IFRAME,
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

/** 三个菜单触发器的文案键：`app.config` / `app.help` 与 `menu.*` 同处一张扁平表。 */
const MENU_SELECTORS: Record<string, string> = {
  file: NAVBAR_MENU_FILE,
  config: NAVBAR_MENU_CONFIG,
  help: NAVBAR_MENU_HELP,
}

const EXPECTED_MENU_LABELS: Record<Language, Record<string, string>> = {
  'zh-CN': { file: '文件', config: '配置', help: '帮助' },
  'en-US': { file: 'File', config: 'Config', help: 'Help' },
}

/** 语言下拉触发器（`Select.Value`）的文案取所选选项的渲染文本。 */
const EXPECTED_SELECT_TEXT: Record<Language, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
}

/** 形如 `menu.file` 的原始 i18n key；正常渲染不应出现。 */
const RAW_I18N_KEY = /^[a-z]\w*(\.\w+)+$/

interface DialogBox {
  viewportWidth: number
  viewportHeight: number
  width: number
  height: number
  bodyOverflowY: string
  pageScrollHeight: number
}

let app: DesktopApp
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

async function readText(selector: string): Promise<string> {
  const node = await browser.$(selector)
  await node.waitForDisplayed({ timeout: 10_000 })
  return (await node.getText()).trim()
}

async function readAriaLabel(selector: string): Promise<string> {
  const node = await browser.$(selector)
  return (await node.getAttribute('aria-label')) ?? ''
}

async function readMenuLabels(): Promise<Record<string, string>> {
  const labels: Record<string, string> = {}
  for (const [key, selector] of Object.entries(MENU_SELECTORS))
    labels[key] = await readAriaLabel(selector)
  return labels
}

/** 7 个观察点：三个菜单触发器 + 配置对话框四个导航项的可见文本。 */
async function readObservationPoints(): Promise<Record<string, string>> {
  const points: Record<string, string> = {}
  for (const [key, selector] of Object.entries(MENU_SELECTORS))
    points[`menu.${key}`] = await readText(selector)
  for (const tab of CONFIG_TABS)
    points[`nav.${tab}`] = await readText(configNav(tab))
  return points
}

/** 当前持久化的语言（`localStorage`，与 `index.detector.ts` 同源）。 */
async function storedLanguage(): Promise<string> {
  return (await browser.execute((key: string) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY)) ?? ''
}

/** 通过「应用」面板的语言下拉切换语言，并等 localStorage 落定。 */
async function selectLanguage(language: Language): Promise<void> {
  await clickWhenReady(browser, CONFIG_LANGUAGE_SELECT)
  await clickWhenReady(browser, configLanguageOption(language))

  await browser.waitUntil(async () => await storedLanguage() === language, {
    timeout: 10_000,
    timeoutMsg: `语言未切到 ${language}`,
  })
}

/** 语言归一到目标值；对话框未开时自己开一个。 */
async function ensureLanguage(language: Language): Promise<void> {
  if (await storedLanguage() === language)
    return
  if (!await isConfigDialogOpen(browser)) {
    // 真实装配车道里 dsh 自己的引导弹层会把遮罩镜像到导航栏，壳层此时按设计不可点。
    // `ensureNavbarClickable()` 会进帧关掉弹层（见 support/onboarding.ts）。
    await ensureNavbarClickable(browser)
    await openConfigTab(browser, 'application')
  }
  await selectLanguage(language)
}

async function appliedTheme(): Promise<string> {
  return await browser.execute(() => document.documentElement.dataset.theme ?? '')
}

async function themePreference(): Promise<string> {
  return await browser.execute(async () => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<string> }
    }).__TAURI_INTERNALS__
    return await internals.invoke('get_dsh_theme')
  }) as string
}

async function prefersDark(): Promise<boolean> {
  return await browser.execute(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
}

describe.skipIf(process.platform === 'darwin')('配置管理与多语言主题', () => {
  beforeAll(async () => {
    app = await startDesktopApp()
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
    // 页面级标记：整个用例期间都应存在，用来区分「弹层被收起」与「webview 被重载」
    await markConfigDialogPage(browser)
    // 首次装配要先过「安装推荐插件」引导，服务才会被拉起（引导自身的用例归批次 06）
    await completePreinstall(browser)
    // iframe 只在 serviceHealthy 时渲染；整批都跑在装配完成的状态下
    await (await browser.$(SHELL_IFRAME)).waitForDisplayed({ timeout: 300_000 })
    // 首次进入 dsh 会弹「内测声明」/「添加 API Key」两个弹层，遮罩镜像到导航栏后
    // 壳层不可点（见 support/onboarding.ts）。先确保导航栏可点，后续用例才能开对话框。
    await ensureNavbarClickable(browser)
  }, 900_000)

  afterAll(async () => {
    await stop?.()
  })

  // 每条用例自带开/关，不依赖上一条留下的对话框状态；语言是全局状态，无论成败都归一
  afterEach(async () => {
    await ensureLanguage('zh-CN')
    if (await isConfigDialogOpen(browser))
      await closeConfigDialog(browser)
  })

  it('TC-DSK-L3-02-001 验证「配置 → 应用」打开对话框并默认定位「应用」面板', async () => {
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

  it('TC-DSK-L3-02-002 验证左侧导航可切换四个面板', async () => {
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

  it('TC-DSK-L3-02-003 验证从导航栏直接定位到指定面板', async () => {
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

  it('TC-DSK-L3-02-004 验证关闭触发器关闭对话框且可再次打开', async () => {
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

  it('TC-DSK-L3-02-007 验证对话框尺寸不超出视口', async () => {
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

  it('TC-DSK-L3-02-008 验证语言切换为 English 后壳层文案即时变更', async () => {
    await openConfigTab(browser, 'application')
    await ensureLanguage('zh-CN')

    expect(await readAriaLabel(NAVBAR_MENU_CONFIG), '切换前不是中文文案').toBe(EXPECTED_MENU_LABELS['zh-CN'].config)

    await selectLanguage('en-US')

    // 不刷新页面即生效：同一观察点在同一会话内变成英文
    await browser.waitUntil(
      async () => await readAriaLabel(NAVBAR_MENU_CONFIG) === EXPECTED_MENU_LABELS['en-US'].config,
      { timeout: 10_000, timeoutMsg: '菜单无障碍标签未随语言变更' },
    )
    expect(await readText(CONFIG_LANGUAGE_SELECT), '语言下拉当前值未同步').toBe(EXPECTED_SELECT_TEXT['en-US'])
    expect(await storedLanguage()).toBe('en-US')
  })

  it('TC-DSK-L3-02-009 验证语言选择在重启后保持', async () => {
    await openConfigTab(browser, 'application')
    await selectLanguage('en-US')
    await closeConfigDialog(browser)

    // 复用同一个隔离根重启：WebView2 profile 与 dsh 数据都在其中。
    // 重启是本用例的断言对象（跨进程持久化），不是编排侧的重复起停。
    const home = app.home
    await app.stop({ keepHome: true })
    app = await startDesktopApp({ homeDir: home, resetStore: false })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
    await markConfigDialogPage(browser)

    expect(await storedLanguage(), '重启后 localStorage 未保留语言').toBe('en-US')
    expect(await readAriaLabel(NAVBAR_MENU_CONFIG), '重启后壳层未按持久化语言渲染')
      .toBe(EXPECTED_MENU_LABELS['en-US'].config)
  }, 300_000)

  it('TC-DSK-L3-02-010 验证切换语言后菜单与提示文案同步为同一语言', async () => {
    await openConfigTab(browser, 'application')
    await selectLanguage('en-US')

    expect(await readMenuLabels(), '菜单文案未全部切到英文').toEqual(EXPECTED_MENU_LABELS['en-US'])
  })

  it('TC-DSK-L3-02-011 验证两种语言下壳层关键文案均非空', async () => {
    await openConfigTab(browser, 'application')
    await ensureLanguage('zh-CN')
    const zh = await readObservationPoints()

    await selectLanguage('en-US')
    await browser.waitUntil(
      async () => (await readText(NAVBAR_MENU_CONFIG)) === EXPECTED_MENU_LABELS['en-US'].config,
      { timeout: 10_000, timeoutMsg: '菜单文案未随语言变更' },
    )
    const en = await readObservationPoints()

    for (const [locale, points] of Object.entries({ 'zh-CN': zh, 'en-US': en })) {
      for (const [name, text] of Object.entries(points)) {
        expect(text, `观察点文案为空：${locale} ${name}`).not.toBe('')
        expect(text, `观察点残留原始 i18n key：${locale} ${name}=${text}`).not.toMatch(RAW_I18N_KEY)
      }
    }
    // 两套文案必须不同，否则「切换语言」可能是空转
    expect(en['menu.file']).not.toBe(zh['menu.file'])
  })

  it('TC-DSK-L3-02-012 验证主题偏好被折算并应用到根节点', async () => {
    const preference = await themePreference()
    expect(['dark', 'light', 'system'], `非法的主题偏好：${preference}`).toContain(preference)
    // 首次进入：scratch home 内没有 settings.yaml，必须回退「跟随系统」而不是固定深色
    expect(preference, '未设置过主题时未回退到系统偏好').toBe('system')

    // `use-theme-adaptive.ts`：`system`（或偏好尚未取到）按系统偏好折算
    const expected = preference === 'system' ? ((await prefersDark()) ? 'dark' : 'light') : preference
    await browser.waitUntil(async () => await appliedTheme() === expected, {
      timeout: 10_000,
      timeoutMsg: `根节点 data-theme 未折算到 ${expected}`,
    })

    expect(['dark', 'light']).toContain(await appliedTheme())
  })

  /** iframe 实例身份的页内存储键。 */
  const IFRAME_MARK = '__dshE2eIframeMark'

  /**
   * 记录 iframe 的 `src` 与实例身份；第二次调用与第一次记录的实例比对。
   *
   * 实例身份取「DOM 节点引用 + 其 `contentWindow`」：`iframe.tsx` 由
   * `key={harness.iframeKey}` 驱动重建，重建即换节点，因此引用变化就是「被重建」。
   * 只比对 `src` 不足以发现重建（重建后 src 通常相同）。
   */
  async function recordIframe(): Promise<{ src: string, sameInstance: boolean }> {
    return await browser.execute((iframeSelector: string, markKey: string) => {
      const store = window as unknown as Record<string, unknown>
      const el = document.querySelector(iframeSelector) as HTMLIFrameElement | null
      const src = el?.getAttribute('src') ?? ''
      const previous = store[markKey] as { el: unknown, win: unknown } | undefined
      if (!previous) {
        store[markKey] = { el, win: el?.contentWindow }
        return { src, sameInstance: true }
      }
      return { src, sameInstance: previous.el === el && previous.win === el?.contentWindow }
    }, SHELL_IFRAME, IFRAME_MARK)
  }

  it('TC-DSK-L3-02-013 [反向] 验证语言切换不重建 iframe', async () => {
    // 真实装配车道：iframe 只在 `serviceHealthy` 时渲染（本文件整批都在该车道上）
    const iframe = await browser.$(SHELL_IFRAME)
    await iframe.waitForDisplayed({ timeout: 300_000 })

    const before = await recordIframe()
    expect(before.src, 'iframe 没有 src').not.toBe('')

    await openConfigTab(browser, 'application')
    await selectLanguage('en-US')
    await browser.waitUntil(
      async () => (await readText(NAVBAR_MENU_CONFIG)) === EXPECTED_MENU_LABELS['en-US'].config,
      { timeout: 10_000, timeoutMsg: '菜单文案未随语言变更' },
    )
    await closeConfigDialog(browser)

    const after = await recordIframe()
    expect(after.src, '语言切换后 iframe 的 src 变了').toBe(before.src)
    expect(after.sameInstance, '语言切换重建了 iframe（实例身份变化）').toBe(true)
  }, 900_000)
})
