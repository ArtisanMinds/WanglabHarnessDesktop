import type { Browser, BrowserContext, ElementHandle, Frame, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { expect, inject } from 'vitest'

// ==========================================
// 1. 常量与选择器配置
// ==========================================

/** 同源嵌入宿主路径：只由 `page.route` 提供，真实 dsh 服务上不存在。 */
export const EMBEDDED_DOCUMENT_PATH = '/dsh-e2e-embed.html'

/** 被测页面的 iframe 尺寸；太小会把设置侧栏折成 Rail 形态，影响几何断言。 */
export const APP_FRAME_VIEWPORT = { width: 1400, height: 900 } as const

/**
 * 「没有 Tauri 宿主」这一环境事实导致的预期噪声。
 * Precise-match list to suppress false negatives.
 */
export const IGNORED_APP_ERRORS: readonly string[] = [
  'NODE_NOT_ANSWERED: invoke ',
]

/** 插件自身注入的元素用 `data-dsh-*`（`plugin.client.md` §4）。 */
export const PET_ICON = '[data-dsh-tauri-pet-icon]'
export const SCHEDULER_ICON = '[data-dsh-scheduler-icon]'
export const WORKTREE_ICON = '[data-dsh-worktree-icon]'
export const WORKTREE_MODE_ANCHOR = '[data-dsh-tauri-worktree-mode-anchor]'
export const WORKTREE_SURFACE = '[data-dsh-worktree-surface]'
export const WORKTREE_DIALOG = '[data-dsh-worktree-dialog="1"]'
export const SESSION_ARCHIVE_ITEM = '[data-dsh-tauri-session-archive-item]'
export const SESSION_ARCHIVE_MENU_PATCHED = '[data-dsh-tauri-session-archive-menu-patched="1"]'
export const TURNREWIND_CARD = '[data-turnrewind-card]'
export const TURNREWIND_RUNNING = '[data-turnrewind-running]'

/** dsh 内部结构（上游产物）：可用稳定结构性锚点。 */
export const SIDEBAR = '[data-slot="sidebar"]'
export const SIDEBAR_PANELLIST = '[data-slot="sidebar.panellist"]'
export const SETTINGS_TRIGGER = '.dshp-settings-trigger'
export const SETTINGS_SIDEBAR = '[data-slot-sidebar="dsh-tauri-ui"]'
export const SETTINGS_SECTION_SLOT = '[data-slot="settings.section"]'
export const SETTINGS_NAV_ITEM = 'nav[aria-label] button'
export const SETTINGS_CONTENT = '[class*="content-inner"]'
export const SETTINGS_ONBOARDING = '[data-slot="settings.onboarding"]'
export const COMPOSER_CARD = '[data-composer-card]'
export const COMPOSER_INPUT_DOCK = '[data-slot="conversation.input.dock"]'
export const CONVERSATION_SESSION = '[data-slot="conversation.session"]'
export const SIDEBAR_ROW = 'button[class*="panelRow"]'

/** 阻塞式引导弹层选择器 */
export const APP_MODAL = '[role="dialog"][aria-modal="true"]'
export const APP_MODAL_CANCEL = 'div[class*="_editorActions"] > button'

// ==========================================
// 2. 类型定义与断言
// ==========================================

export interface DshPage {
  browser: Browser
  context: BrowserContext
  page: Page
  frame: Frame
  errors: string[]
  /** 本轮走合成事件兜底的调用点；用例用 `expectNoSyntheticFallbacks` 断言为空。 */
  syntheticFallbacks: SyntheticFallback[]
  close: () => Promise<void>
}

/** 一次「绕过命中测试的合成点击」记录。 */
export interface SyntheticFallback {
  /** 走兜底的调用点，如 `clickInFrame` / `openSettings` / `selectSettingsSection`。 */
  site: string
  /** 兜底目标的可读描述。 */
  target: string
}

export interface NewDshPageOptions {
  ready?: string
  path?: string
  dismissModals?: boolean
}

/** 断言本轮没有任何合成事件兜底：真实指针点击必须自己点得通。 */
export function expectNoSyntheticFallbacks(app: DshPage): void {
  const detail = app.syntheticFallbacks.map(item => `${item.site} → ${item.target}`).join('; ')
  expect(
    app.syntheticFallbacks,
    `真实指针点击未生效，走了合成事件兜底（${detail || '无'}）`,
  ).toEqual([])
}

export function appUrl(path = '/'): string {
  return `${inject('dshBaseUrl')}${path}`
}

// ==========================================
// 3. 浏览器与 Context 基础构建
// ==========================================

export function launchDshBrowser(): Promise<Browser> {
  return chromium.launch()
}

export function newDshContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: APP_FRAME_VIEWPORT })
}

export async function addSessionCookie(context: BrowserContext): Promise<void> {
  const [name, ...rest] = inject('dshCookie').split('=')
  await context.addCookies([{ name, value: rest.join('='), url: inject('dshBaseUrl') }])
}

async function installEmbedRoute(page: Page): Promise<void> {
  const embedUrl = `${inject('dshBaseUrl')}${EMBEDDED_DOCUMENT_PATH}`
  const htmlContent = `<!doctype html><html><body style="margin:0;overflow:hidden">`
    + `<iframe id="dsh" src="/" style="width:${APP_FRAME_VIEWPORT.width}px;height:${APP_FRAME_VIEWPORT.height}px;border:0"></iframe>`
    + '</body></html>'

  await page.route(embedUrl, route =>
    route.fulfill({
      contentType: 'text/html',
      body: htmlContent,
    }))
}

/** 采集父页与 frame 的错误；返回的数组由用例在断言前读取。 */
export function collectAppErrors(page: Page): string[] {
  const errors: string[] = []
  const record = (source: string, message: string): void => {
    const line = `${source} ${message.split('\n')[0]}`
    if (!IGNORED_APP_ERRORS.some(ignored => line.includes(ignored))) {
      errors.push(line)
    }
  }

  page.on('pageerror', error => record('PAGEERROR', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      record('CONSOLE', message.text())
    }
  })
  return errors
}

// ==========================================
// 4. 页面初始化与生命周期编排
// ==========================================

/**
 * 在当前 browser 上新建一个内嵌 dsh 页面并等待界面可用。
 */
export async function newDshPage(
  browser: Browser,
  options: NewDshPageOptions = {},
): Promise<DshPage> {
  const context = await newDshContext(browser)
  await addSessionCookie(context)

  const page = await context.newPage()
  const errors = collectAppErrors(page)
  const syntheticFallbacks: SyntheticFallback[] = []
  const isEmbedded = options.path === undefined

  if (isEmbedded) {
    await installEmbedRoute(page)
  }

  await page.goto(appUrl(options.path ?? EMBEDDED_DOCUMENT_PATH))

  let frame = page.mainFrame()
  if (isEmbedded) {
    const candidate = page.frames().find(item => item !== page.mainFrame())
    expect(candidate, '嵌入文档必须产出被测 iframe').toBeDefined()
    frame = candidate!
  }

  await frame.waitForLoadState('domcontentloaded')
  await frame.locator(options.ready ?? PET_ICON).first().waitFor({ state: 'attached', timeout: 30_000 })

  if (options.dismissModals ?? true) {
    await dismissAppModals(page, frame, syntheticFallbacks)
  }

  return {
    browser,
    context,
    page,
    frame,
    errors,
    syntheticFallbacks,
    close: async () => {
      await page.close().catch(() => {})
      await context.close()
    },
  }
}

/** 便捷封装：自建 browser + 页面（单条用例自足时用）。 */
export async function openDshApp(options: NewDshPageOptions = {}): Promise<DshPage> {
  const browser = await launchDshBrowser()
  const app = await newDshPage(browser, options)
  return {
    ...app,
    close: async () => {
      await app.close()
      await browser.close()
    },
  }
}

// ==========================================
// 5. 交互与 DOM 事件辅助
// ==========================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 等某一个元素从 DOM 移除。 */
async function waitForDetached(handle: ElementHandle, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const isConnected = await handle.evaluate(el => el.isConnected).catch(() => false)
    if (!isConnected)
      return
    await delay(100)
  }
  throw new Error(`点击关闭项后弹层在 ${timeoutMs}ms 内仍未从 DOM 移除`)
}

/** 帧内合成 `click`：绕过命中测试直接派发事件。 */
async function dispatchSyntheticClick(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/**
 * 用真实指针事件点击。缺失几何信息或不可命中时，退回合成点击并记录兜底。
 */
export async function clickInFrame(
  page: Page,
  target: Locator,
  fallbacks?: SyntheticFallback[],
): Promise<void> {
  let box = await target.boundingBox()
  if (!box) {
    await target.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {})
    box = await target.boundingBox()
  }

  if (!box) {
    fallbacks?.push({ site: 'clickInFrame', target: target.toString() })
    await dispatchSyntheticClick(target)
    return
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/**
 * 内部通用辅助：执行点击，并在预期属性未发生变化时降级为合成点击。
 */
async function clickWithFallback(
  page: Page,
  target: Locator,
  attrName: string,
  expectedVal: string,
  siteName: string,
  fallbackTargetDesc: string,
  fallbacks?: SyntheticFallback[],
  offsetX?: number,
): Promise<void> {
  const box = await target.boundingBox()
  if (offsetX !== undefined && box) {
    await page.mouse.click(box.x + Math.min(box.width / 2, offsetX), box.y + box.height / 2)
  }
  else {
    await clickInFrame(page, target, fallbacks)
  }

  if (await target.getAttribute(attrName) !== expectedVal) {
    fallbacks?.push({ site: siteName, target: fallbackTargetDesc })
    await dispatchSyntheticClick(target)
  }
}

// ==========================================
// 6. 弹层与设置面板特定操作
// ==========================================

/** 关掉当前帧内的一个阻塞弹层。 */
async function dismissOneModal(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
): Promise<boolean> {
  const dialog = frame.locator(APP_MODAL).first()
  if (await dialog.count() === 0)
    return false

  const snapshot = await dialog.elementHandle()
  if (!snapshot)
    return false

  const cancel = dialog.locator(APP_MODAL_CANCEL).first()
  const action = (await cancel.count() > 0) ? cancel : dialog.locator('button').first()

  if (await action.count() === 0) {
    throw new Error(
      `帧内存在阻塞弹层 ${APP_MODAL}，但取消容器 ${APP_MODAL_CANCEL} 与兜底 button 都不存在，无法关闭`,
    )
  }

  await clickInFrame(page, action, fallbacks)
  await waitForDetached(snapshot, 8_000)
  return true
}

/** 确保帧内无阻塞弹层（可重入的闸）。 */
export async function dismissAppModals(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await dismissOneModal(page, frame, fallbacks))
      continue
    await delay(300)
    if (await dismissOneModal(page, frame, fallbacks))
      continue
    return
  }

  const remaining = await frame.locator(APP_MODAL).count()
  throw new Error(
    `关闭阻塞弹层超时（${timeoutMs}ms）；当前帧仍有 ${remaining} 个 ${APP_MODAL}`
    + '（弹层一直没被点掉：检查它是否持续重挂，或点击被遮罩 / inert 吞掉）',
  )
}

/** 等「带凭据输入的 API Key 引导弹层」，返回它的 locator。 */
export async function waitForCredentialModal(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
  timeoutMs = 45_000,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const withInput = frame.locator(`${APP_MODAL}:has(input, textarea)`)
    if (await withInput.count() > 0) {
      return withInput.first()
    }

    if (await frame.locator(APP_MODAL).count() > 0) {
      await dismissOneModal(page, frame, fallbacks)
    }
    else {
      await delay(300)
    }
  }
  throw new Error('等待带凭据输入的 API Key 引导弹层超时')
}

/** 打开设置侧栏，返回触发器的 locator。 */
export async function openSettings(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
): Promise<Locator> {
  await dismissAppModals(page, frame, fallbacks)
  const trigger = frame.locator(SETTINGS_TRIGGER).first()
  await trigger.waitFor({ state: 'attached', timeout: 20_000 })

  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    await clickWithFallback(
      page,
      trigger,
      'aria-expanded',
      'true',
      'openSettings',
      `${SETTINGS_TRIGGER} aria-expanded 未被指针点击改写`,
      fallbacks,
    )
  }

  await expect.poll(
    () => trigger.getAttribute('aria-expanded'),
    { timeout: 15_000, message: '点击设置触发器后 aria-expanded 必须变为 true' },
  ).toBe('true')

  await frame.locator(SETTINGS_SECTION_SLOT).first().waitFor({ state: 'attached', timeout: 15_000 })
  return trigger
}

/** 点开设置侧栏里的某个分区，等 `aria-current` 激活。 */
export async function selectSettingsSection(
  page: Page,
  frame: Frame,
  title: string,
  fallbacks?: SyntheticFallback[],
): Promise<Locator> {
  await dismissAppModals(page, frame, fallbacks)
  const item = frame.locator(SETTINGS_NAV_ITEM, { hasText: title }).first()
  await item.waitFor({ state: 'attached', timeout: 15_000 })

  const box = await item.boundingBox()
  expect(box, `分区「${title}」的导航项必须有可见几何`).not.toBeNull()

  await clickWithFallback(
    page,
    item,
    'aria-current',
    'true',
    'selectSettingsSection',
    `分区「${title}」aria-current 未被指针点击改写`,
    fallbacks,
    40, // 点击偏移 X 坐标
  )

  await expect.poll(
    () => item.getAttribute('aria-current'),
    { timeout: 15_000, message: `点击「${title}」后该分区必须成为活动分区` },
  ).toBe('true')

  return item
}
