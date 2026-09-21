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
 * 而没有 Tauri 宿主，Tauri 桥调用必然失败，这属于环境的预期噪声，不是被测插件的缺陷；
 * 过滤后仍出现的错误才是真问题。
 *
 * 两类「静默失败」在本文件里被显式堵住：① 弹层关不掉（`dismissAppModals` 到期即失败，
 * 不再与「本来就没弹层」混为一谈）；② 合成 `dispatchEvent` 兜底绕过命中测试（每次走兜底
 * 都记进 `SyntheticFallback`，用例用 `expectNoSyntheticFallbacks` 把它钉在 0）。
 */

import type { Browser, BrowserContext, ElementHandle, Frame, Page } from 'playwright'
import { chromium } from 'playwright'
import { expect, inject } from 'vitest'

/** 同源嵌入宿主路径：只由 `page.route` 提供，真实 dsh 服务上不存在。 */
export const EMBEDDED_DOCUMENT_PATH = '/dsh-e2e-embed.html'

/** 被测页面的 iframe 尺寸；太小会把设置侧栏折成 Rail 形态，影响几何断言。 */
export const APP_FRAME_VIEWPORT = { width: 1400, height: 900 }

/**
 * 「没有 Tauri 宿主」这一环境事实导致的预期噪声。
 *
 * 每条都必须是精确串并写明理由：`'invoke '` / `'__TAURI'` / `'Failed to fetch'` 这类宽串
 * 会把真实故障一起过滤（例如真正抛出的 invoke 失败、页面断网），假绿就从过滤器进来。
 */
export const IGNORED_APP_ERRORS: readonly string[] = [
  // iframe 内 `invoke()` 把请求 `postMessage` 给父页后无人应答，15s 后按超时拒绝
  // （`packages/dsh-tauri/src/client/service/invoke.ts:39,49,67` 的三条消息共用此前缀）。
  // 纯浏览器里不存在 Tauri 宿主，任何插件命令都只能落到这里，与插件行为无关。
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
  /** 本轮走合成事件兜底的调用点；用例用 `expectNoSyntheticFallbacks` 断言为空。 */
  syntheticFallbacks: SyntheticFallback[]
  close: () => Promise<void>
}

/**
 * 一次「绕过命中测试的合成点击」记录。
 *
 * 合成 `dispatchEvent` 直接派发给目标元素，因此它只能证明「插件的 DOM 监听被触发」，
 * 不能证明「用户点得到」——目标被后到的样式盖住、或 `#root[inert]` 吞掉指针事件时，
 * 真实点击失败但合成点击照样生效。记录成对象而不是布尔值，是为了在断言失败时直接
 * 给出「哪个调用点、点了哪个目标」。
 */
export interface SyntheticFallback {
  /** 走兜底的调用点，如 `clickInFrame` / `openSettings` / `selectSettingsSection`。 */
  site: string
  /** 兜底目标的可读描述。 */
  target: string
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
  const syntheticFallbacks: SyntheticFallback[] = []
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
    await dismissAppModals(page, frame, syntheticFallbacks)

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
 * 等**某一个**元素从 DOM 移除。
 *
 * 不能用 `frame.locator(APP_MODAL).first().waitFor({ state: 'detached' })`：locator 是活的，
 * 关掉「内测声明」后 `.first()` 立刻改指紧随其后弹出的「API Key 引导」，于是「已关掉」被
 * 误判成「一直没关掉」。这里对点击前抓下的元素句柄轮询 `isConnected`，句柄本身消失
 * （页面已卸载该节点）同样算已移除。
 */
async function waitForDetached(handle: ElementHandle, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const connected = await handle.evaluate(element => element.isConnected).catch(() => false)
    if (!connected)
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`点击关闭项后弹层在 ${timeoutMs}ms 内仍未从 DOM 移除`)
}

/**
 * 关掉当前帧内的一个阻塞弹层；无弹层时返回 `false`，弹层存在但关不掉时抛出。
 *
 * 「内测声明」（`headless`，正文只有「继续」）与「API Key 引导」（取消项在 `_editorActions`）
 * 都走同一个 `Modal`，按取消容器优先、否则退回第一个按钮；前者关掉后会**紧接着**弹出后者，
 * 因此关闭判据必须绑定被点的那个元素。
 *
 * 两条失败路径都必须显式暴露，否则「点不动」会被伪装成「已关闭」：
 *   ① 有弹层但没有任何按钮 → 直接报错，不再当作 `false`（那会让外层以为本来就没弹层）；
 *   ② 点完之后弹层不消失 → `waitForDetached` 抛错，不再 `catch` 吞掉。
 */
async function dismissOneModal(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
): Promise<boolean> {
  const dialog = frame.locator(APP_MODAL).first()
  if (await dialog.count() === 0)
    return false

  const snapshot = await dialog.elementHandle()
  if (snapshot === null)
    return false

  const cancel = dialog.locator(APP_MODAL_CANCEL).first()
  const action = await cancel.count() > 0 ? cancel : dialog.locator('button').first()
  if (await action.count() === 0) {
    throw new Error(
      `帧内存在阻塞弹层 ${APP_MODAL}，但取消容器 ${APP_MODAL_CANCEL} 与兜底 button 都不存在，无法关闭`,
    )
  }

  await clickInFrame(page, action, fallbacks)
  await waitForDetached(snapshot, 8_000)
  return true
}

/**
 * 确保帧内无阻塞弹层（可重入的闸）：关一个 → 再看还有没有，直到连续两次都空。
 *
 * 不能只在页面就绪时关一次——弹层挂载晚于服务就绪，且关闭状态按帧内页面加载判定、不落盘，
 * iframe 一旦重建就重新弹出；不关掉则所有真实指针点击都会被 `#root[inert]` 吞掉。
 *
 * 循环**只有两个出口**：连续两次探到「无弹层」，或抛错。旧实现第三个出口是「到期直接
 * `return`」，于是一轮都没关掉（弹层持续重挂）与「本来就没弹层」不可区分、静默假绿；
 * 现在到期即失败，并把帧内当前的弹层数带进诊断。
 */
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
    await new Promise(resolve => setTimeout(resolve, 300))
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

/**
 * 等「带凭据输入的 API Key 引导弹层」，返回它的 locator。
 *
 * 首屏的「内测声明」没有输入控件、排在引导之前，必须先关掉它才会出现真正的引导弹层；
 * 因此这里把「无输入控件的弹层」逐个关掉，直到出现带输入控件的那个。
 */
export async function waitForCredentialModal(
  page: Page,
  frame: Frame,
  fallbacks?: SyntheticFallback[],
  timeoutMs = 45_000,
): Promise<ReturnType<Frame['locator']>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const withInput = frame.locator(`${APP_MODAL}:has(input, textarea)`)
    if (await withInput.count() > 0)
      return withInput.first()

    if (await frame.locator(APP_MODAL).count() > 0)
      await dismissOneModal(page, frame, fallbacks)
    else
      await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('等待带凭据输入的 API Key 引导弹层超时')
}

/** 帧内合成 `click`：仍会触发被测插件真实注册的 DOM 监听，但不经过命中测试。 */
async function dispatchSyntheticClick(target: ReturnType<Frame['locator']>): Promise<void> {
  await target.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/**
 * 用真实指针事件点击（`boundingBox` 给出父页视口坐标）。
 *
 * dsh 的设置菜单是懒加载资源，刚打开时目标可能被后到的样式遮住，`locator.click`
 * 会一直判为不可命中而超时；目标连几何都没有时退回 frame 内的合成 `click`。
 * 兜底一旦发生就写进 `fallbacks`：合成点击证明不了「用户点得到」，必须由用例
 * （`expectNoSyntheticFallbacks`）显式确认它没被用上，而不是静默通过。
 */
export async function clickInFrame(
  page: Page,
  target: ReturnType<Frame['locator']>,
  fallbacks?: SyntheticFallback[],
): Promise<void> {
  let box = await target.boundingBox()
  if (box === null) {
    await target.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {})
    box = await target.boundingBox()
  }
  if (box === null) {
    fallbacks?.push({ site: 'clickInFrame', target: target.toString() })
    await dispatchSyntheticClick(target)
    return
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** 打开设置侧栏，返回触发器的 locator。 */
export async function openSettings(page: Page, frame: Frame, fallbacks?: SyntheticFallback[]) {
  await dismissAppModals(page, frame, fallbacks)
  const trigger = frame.locator(SETTINGS_TRIGGER).first()
  await trigger.waitFor({ state: 'attached', timeout: 20_000 })
  if (await trigger.getAttribute('aria-expanded') !== 'true')
    await clickInFrame(page, trigger, fallbacks)
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    fallbacks?.push({ site: 'openSettings', target: `${SETTINGS_TRIGGER} aria-expanded 未被指针点击改写` })
    await dispatchSyntheticClick(trigger)
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
 *
 * 与 `openSettings` 同一策略：几何缺失即报错（导航项不可见就是不可点），
 * `aria-current` 没被指针点击改写才退回合成点击，并把这次兜底记进 `fallbacks`。
 */
export async function selectSettingsSection(
  page: Page,
  frame: Frame,
  title: string,
  fallbacks?: SyntheticFallback[],
): Promise<ReturnType<Frame['locator']>> {
  await dismissAppModals(page, frame, fallbacks)
  const item = frame.locator(SETTINGS_NAV_ITEM, { hasText: title }).first()
  await item.waitFor({ state: 'attached', timeout: 15_000 })

  const box = await item.boundingBox()
  expect(box, `分区「${title}」的导航项必须有可见几何`).not.toBeNull()
  await page.mouse.click(box!.x + Math.min(box!.width / 2, 40), box!.y + box!.height / 2)
  if (await item.getAttribute('aria-current') !== 'true') {
    fallbacks?.push({ site: 'selectSettingsSection', target: `分区「${title}」aria-current 未被指针点击改写` })
    await dispatchSyntheticClick(item)
  }

  await expect.poll(
    async () => await item.getAttribute('aria-current'),
    { timeout: 15_000, message: `点击「${title}」后该分区必须成为活动分区` },
  ).toBe('true')
  return item
}
