/**
 * 浏览器层用例（`-C-*` / 降级 L3）的共享编排。
 *
 * 插件 client 只在内嵌 frame 内生效（`packages/dsh-tauri/src/client/apply.ts:29`、
 * `packages/dsh-tauri-pet/src/client/index.ts:24` 的 `window.parent === window` 早退），
 * 因此每条用例都必须把真实 dsh 页面装进一个 iframe。方案：在 dsh 同源上拦截一个
 * 专用路径（`EMBEDDED_DOCUMENT_PATH`），返回只含该 iframe 的极小文档，于是父页与
 * 被测页面同源，用例既能在 frame 内断言，也能直接读 frame 的 `document`。
 *
 * 鉴权：dsh 只接受「根路径 `?token=` 换 Cookie」这一条通道，所以 Cookie 必须在
 * `newContext` 阶段注入 `inject('dshCookie')`，否则 `/api/**` 与插件路由一律 401。
 *
 * 采集 `pageerror` / `console.error` 时按 `IGNORED_APP_ERRORS` 过滤：用例跑在纯浏览器里
 * 而没有 Tauri 宿主，所有 Tauri 桥调用必然失败（`NODE_NOT_ANSWERED`），这属于环境的
 * 预期噪声，不是被测插件的缺陷；过滤后仍出现的错误才是真问题。
 */

import type { Browser, BrowserContext, Frame, Page } from 'playwright'
import { chromium } from 'playwright'
import { expect, inject } from 'vitest'

/** 同源嵌入宿主路径：只由 `page.route` 提供，真实 dsh 服务上不存在。 */
export const EMBEDDED_DOCUMENT_PATH = '/dsh-e2e-embed.html'

/** 被测页面的 iframe 尺寸；太小会把设置侧栏折成 Rail 形态，影响几何断言。 */
export const APP_FRAME_VIEWPORT = { width: 1400, height: 900 }

/** 「没有 Tauri 宿主」这一环境事实导致的预期噪声。 */
export const IGNORED_APP_ERRORS: readonly string[] = [
  'NODE_NOT_ANSWERED',
  'invoke ',
  '__TAURI',
  'Failed to fetch',
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

/** dsh 内部结构（上游产物）：可用稳定结构性锚点，缺口登记在各批次文档。 */
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

/**
 * 阻塞式引导弹层（`OnboardingModal`）：`Modal.onClose` 是空实现，点遮罩 / 按 Esc 都关不掉，
 * 只有点正向按钮（引导页取消项在 `EditorFooter` 的 `_editorActions` 里）才会 `complete()`。
 * 关闭状态是「按帧内页面加载判定」的插槽状态、不落盘，iframe 重建即复发，因此必须可重入。
 */
export const APP_MODAL = '[role="dialog"][aria-modal="true"]'
export const APP_MODAL_CANCEL = 'div[class*="_editorActions"] > button'

export interface DshPage {
  browser: Browser
  context: BrowserContext
  page: Page
  frame: Frame
  errors: string[]
  close: () => Promise<void>
}

export function appUrl(path = '/'): string {
  return `${inject('dshBaseUrl')}${path}`
}

async function installEmbedRoute(page: Page): Promise<void> {
  await page.route(`${inject('dshBaseUrl')}${EMBEDDED_DOCUMENT_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0;overflow:hidden">`
        + `<iframe id="dsh" src="/" style="width:${APP_FRAME_VIEWPORT.width}px;height:${APP_FRAME_VIEWPORT.height}px;border:0"></iframe>`
        + '</body></html>',
    })
  })
}

export async function launchDshBrowser(): Promise<Browser> {
  return await chromium.launch()
}

export function newDshContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: APP_FRAME_VIEWPORT })
}

export async function addSessionCookie(context: BrowserContext): Promise<void> {
  const [name, ...rest] = inject('dshCookie').split('=')
  await context.addCookies([{ name, value: rest.join('='), url: inject('dshBaseUrl') }])
}

/** 采集父页与 frame 的错误；返回的数组由用例在断言前读取。 */
export function collectAppErrors(page: Page): string[] {
  const errors: string[] = []
  const record = (source: string, message: string): void => {
    const line = `${source} ${message.split('\n')[0]}`
    if (!IGNORED_APP_ERRORS.some(ignored => line.includes(ignored)))
      errors.push(line)
  }
  page.on('pageerror', error => record('PAGEERROR', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error')
      record('CONSOLE', message.text())
  })
  return errors
}

/**
 * 在当前 browser 上新建一个内嵌 dsh 页面并等待界面可用（每个用例一条，互不串状态）。
 *
 * `path === undefined` 时走同源嵌入文档；显式给 `path` 则导航到该真实路径（顶层页面
 * 场景），此时不会有 iframe，`frame` 即主 frame。
 * `ready` 缺省等桌宠入口按钮——它由 `sidebar-icon` 补丁在侧栏就绪后插入，是「侧栏与
 * 插件 client 都活了」的可观察证据。
 */
export async function newDshPage(browser: Browser, options: {
  ready?: string
  path?: string
  dismissModals?: boolean
} = {}): Promise<DshPage> {
  const context = await newDshContext(browser)
  await addSessionCookie(context)
  const page = await context.newPage()
  const errors = collectAppErrors(page)
  const embedded = options.path === undefined
  if (embedded)
    await installEmbedRoute(page)

  await page.goto(appUrl(options.path ?? EMBEDDED_DOCUMENT_PATH))
  let frame = page.mainFrame()
  if (embedded) {
    const candidate = page.frames().find(item => item !== page.mainFrame())
    expect(candidate, '嵌入文档必须产出被测 iframe').toBeDefined()
    frame = candidate!
  }
  await frame.waitForLoadState('domcontentloaded')
  await frame.locator(options.ready ?? PET_ICON).first().waitFor({ state: 'attached', timeout: 30_000 })
  if (options.dismissModals ?? true)
    await dismissAppModals(page, frame)

  return {
    browser,
    context,
    page,
    frame,
    errors,
    close: async () => {
      await page.close().catch(() => {})
      await context.close()
    },
  }
}

/** 便捷封装：自建 browser + 页面（单条用例自足时用）。 */
export async function openDshApp(options: {
  ready?: string
  path?: string
  dismissModals?: boolean
} = {}): Promise<DshPage> {
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

/**
 * 关掉当前帧内的一个阻塞弹层；无弹层时返回 `false`。
 *
 * 「内测声明」（`headless`，正文只有「继续」）与「API Key 引导」（取消项在 `_editorActions`）
 * 都走同一个 `Modal`，按取消容器优先、否则退回第一个按钮。
 */
async function dismissOneModal(page: Page, frame: Frame): Promise<boolean> {
  const dialog = frame.locator(APP_MODAL).first()
  if (await dialog.count() === 0)
    return false

  const cancel = dialog.locator(APP_MODAL_CANCEL).first()
  const action = await cancel.count() > 0 ? cancel : dialog.locator('button').first()
  if (await action.count() === 0)
    return false

  await clickInFrame(page, frame, action)
  await dialog.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {})
  return true
}

/**
 * 确保帧内无阻塞弹层（可重入的闸）：关一个 → 再看还有没有，直到连续两次都空。
 *
 * 不能只在页面就绪时关一次——弹层挂载晚于服务就绪，且关闭状态按帧内页面加载判定、不落盘，
 * iframe 一旦重建就重新弹出；不关掉则所有真实指针点击都会被 `#root[inert]` 吞掉。
 */
export async function dismissAppModals(page: Page, frame: Frame, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await dismissOneModal(page, frame))
      continue
    await new Promise(resolve => setTimeout(resolve, 300))
    if (await dismissOneModal(page, frame))
      continue
    return
  }
}

/**
 * 等「带凭据输入的 API Key 引导弹层」，返回它的 locator。
 *
 * 首屏的「内测声明」没有输入控件、排在引导之前，必须先关掉它才会出现真正的引导弹层；
 * 因此这里把「无输入控件的弹层」逐个关掉，直到出现带输入控件的那个。
 */
export async function waitForCredentialModal(
  page: Page,
  frame: Frame,
  timeoutMs = 45_000,
): Promise<ReturnType<Frame['locator']>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const withInput = frame.locator(`${APP_MODAL}:has(input, textarea)`)
    if (await withInput.count() > 0)
      return withInput.first()

    if (await frame.locator(APP_MODAL).count() > 0)
      await dismissOneModal(page, frame)
    else
      await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('等待带凭据输入的 API Key 引导弹层超时')
}

/**
 * 用真实指针事件点击（`boundingBox` 给出父页视口坐标）。
 *
 * dsh 的设置菜单是懒加载资源，刚打开时目标可能被后到的样式遮住，`locator.click`
 * 会一直判为不可命中而超时；需要兜底的调用方（如 `openSettings`）在指针点击无效后
 * 再补一次 frame 内的合成 `click`——它仍会触发被测插件真实注册的 DOM 监听，只是不
 * 经过命中测试。
 */
export async function clickInFrame(
  page: Page,
  frame: Frame,
  target: ReturnType<Frame['locator']>,
): Promise<void> {
  let box = await target.boundingBox()
  if (box === null) {
    await target.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {})
    box = await target.boundingBox()
  }
  if (box === null) {
    await target.evaluate((element) => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    return
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** 打开设置侧栏，返回触发器的 locator。 */
export async function openSettings(page: Page, frame: Frame) {
  await dismissAppModals(page, frame)
  const trigger = frame.locator(SETTINGS_TRIGGER).first()
  await trigger.waitFor({ state: 'attached', timeout: 20_000 })
  if (await trigger.getAttribute('aria-expanded') !== 'true')
    await clickInFrame(page, frame, trigger)
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    await trigger.evaluate((element) => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }
  await expect.poll(
    async () => await trigger.getAttribute('aria-expanded'),
    { timeout: 15_000, message: '点击设置触发器后 aria-expanded 必须变为 true' },
  ).toBe('true')
  await frame.locator(SETTINGS_SECTION_SLOT).first().waitFor({ state: 'attached', timeout: 15_000 })
  return trigger
}

/**
 * 点开设置侧栏里的某个分区，等 `dshp-settings-sidebar__nav-item--active` 落到它头上。
 *
 * 分区导航只渲染 `label`，不渲染注册时的 `id`（`id` 只存在于 `store.sections` 快照里），
 * 因此定位只能按文案；内容侧则按插件 `dshp-*` 类断言。
 */
export async function selectSettingsSection(
  page: Page,
  frame: Frame,
  title: string,
): Promise<ReturnType<Frame['locator']>> {
  await dismissAppModals(page, frame)
  const item = frame.locator(SETTINGS_NAV_ITEM, { hasText: title }).first()
  await item.waitFor({ state: 'attached', timeout: 15_000 })

  const box = await item.boundingBox()
  expect(box, `分区「${title}」的导航项必须有可见几何`).not.toBeNull()
  await page.mouse.click(box!.x + Math.min(box!.width / 2, 40), box!.y + box!.height / 2)
  if (await item.getAttribute('aria-current') !== 'true') {
    await item.evaluate((element) => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }

  await expect.poll(
    async () => await item.getAttribute('aria-current'),
    { timeout: 15_000, message: `点击「${title}」后该分区必须成为活动分区` },
  ).toBe('true')
  return item
}
