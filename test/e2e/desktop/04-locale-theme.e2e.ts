/**
 * L3 桌面端 E2E：语言与主题。
 *
 * 用例来源：docs/testing/desktop/04-locale-theme.md，一个 `it()` 对应一条用例。
 * 编排：test/e2e/support/desktop-host.ts；对话框：test/e2e/support/config-dialog.ts
 *
 * 运行：pnpm test:e2e:desktop -- --run test/e2e/desktop/04-locale-theme.e2e.ts
 *   前置：`dist/` 已由 `vite build` 产出，且 Debug 二进制经
 *         `tauri build --debug --no-bundle` 构建。
 *
 * 以 `disableDownload: true` 启动：语言与主题都是壳层状态，不依赖装配完成。
 * WebView2 profile 由 harness 指到 scratch home（`DSH_E2E_WEBVIEW_DATA_DIR`），
 * 用例写入的 localStorage 随 home 一起销毁，不污染开发会话。
 * TC-006（语言切换不重建 iframe）需 `serviceHealthy`（真实 dsh 运行中），见文档 §6。
 */

import type { DesktopApp } from '../support/desktop-host'
import type { Language } from '../support/selectors'
import process from 'node:process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  closeConfigDialog,
  isConfigDialogOpen,
  markConfigDialogPage,
  openConfigTab,
} from '../support/config-dialog'
import { startDesktopApp } from '../support/desktop-host'
import { clickWhenReady } from '../support/navbar-menu'
import { completePreinstall } from '../support/preinstall'
import {
  CONFIG_LANGUAGE_SELECT,
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

let app: DesktopApp
let browser: WebdriverIO.Browser
let stop: () => Promise<void>

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
  if (!await isConfigDialogOpen(browser))
    await openConfigTab(browser, 'application')
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

describe.skipIf(process.platform === 'darwin')('语言与主题', () => {
  beforeAll(async () => {
    app = await startDesktopApp({ disableDownload: true })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
    await markConfigDialogPage(browser)
  })

  afterAll(async () => {
    await stop?.()
  })

  // 语言是全局状态：无论用例成败都归一，避免后续用例与开发会话被带偏
  afterEach(async () => {
    await ensureLanguage('zh-CN')
    if (await isConfigDialogOpen(browser))
      await closeConfigDialog(browser)
  })

  it('TC-DSK-L3-04-001 验证语言切换为 English 后壳层文案即时变更', async () => {
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

  it('TC-DSK-L3-04-002 验证语言选择在重启后保持', async () => {
    await openConfigTab(browser, 'application')
    await selectLanguage('en-US')
    await closeConfigDialog(browser)

    // 复用同一个隔离根重启：WebView2 profile 与 dsh 数据都在其中
    const home = app.home
    await app.stop({ keepHome: true })
    app = await startDesktopApp({ disableDownload: true, homeDir: home, resetStore: false })
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()

    expect(await storedLanguage(), '重启后 localStorage 未保留语言').toBe('en-US')
    expect(await readAriaLabel(NAVBAR_MENU_CONFIG), '重启后壳层未按持久化语言渲染')
      .toBe(EXPECTED_MENU_LABELS['en-US'].config)
  })

  it('TC-DSK-L3-04-003 验证切换语言后菜单与提示文案同步为同一语言', async () => {
    await openConfigTab(browser, 'application')
    await selectLanguage('en-US')

    expect(await readMenuLabels(), '菜单文案未全部切到英文').toEqual(EXPECTED_MENU_LABELS['en-US'])
  })

  it('TC-DSK-L3-04-004 验证两种语言下壳层关键文案均非空', async () => {
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

  it('TC-DSK-L3-04-005 验证主题偏好被折算并应用到根节点', async () => {
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

  it('TC-DSK-L3-04-006 [反向] 验证语言切换不重建 iframe', async () => {
    // 真实装配车道：iframe 只在 `serviceHealthy` 时渲染，所以这里必须关掉 disableDownload
    await app.stop()
    app = await startDesktopApp()
    browser = app.browser
    stop = app.stop
    await (await browser.$(NAVBAR_ROOT)).waitForDisplayed()
    await markConfigDialogPage(browser)

    // 首次装配要先过「安装推荐插件」引导，服务才会被拉起（引导自身的用例归批次 08）
    await completePreinstall(browser)

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
