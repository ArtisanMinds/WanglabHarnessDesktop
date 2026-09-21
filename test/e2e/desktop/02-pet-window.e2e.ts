/**
 * 批次 02 的 L3 段 · `dsh-tauri-pet` 的**独立桌宠窗口**（用例来源：
 * `docs/testing/plugins/02-dsh-tauri-pet.md` §4 的 `TC-PET-L3-02-001..004`）。
 *
 * 为什么这一段的运行归属是 `desktop` 车道而不是 `plugin` 车道（子设计 §2 决策 1）：
 * 四条断言的对象都是 **Tauri 原生产物**——独立 OS 窗口句柄集合（`main` / `pet`）、
 * 窗口创建与销毁、窗口尺寸夹紧。这些在纯浏览器里不可能观测，而 `plugin` 车道的 CI
 * 作业跑在 ubuntu-latest、没有 Tauri；把用例留在插件文件里就等于「写了却永不执行」。
 *
 * 前置：Windows + `pnpm build:debug`。运行：
 * `pnpm test:e2e:desktop -- --run test/e2e/desktop/02-pet-window.e2e.ts`
 * （本机若已有桌面实例占着 WebDriver 4445，用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路。）
 *
 * 命令通道（实测确定的唯一可行路径）：**帧内** `__TAURI_INTERNALS__.invoke` 会被
 * `@wdio/tauri-service` 的 execute 拦截器判为「未知插件」而拒绝，因此命令一律在
 * **壳层**（`main` webview，`http://tauri.localhost/`）里调用——那里的 `invoke` 直连
 * Rust。启用/关闭走侧栏入口的真实点击（用户路径），只读状态走壳层 `get_pet_status`。
 * 窗口句柄集合经 `getWindowHandles()` 读取，是「独立 OS 窗口是否真的存在」的外部证据。
 */

import type { DesktopApp } from '../support/desktop-host'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDesktopApp } from '../support/desktop-host'
import { dismissDshModals } from '../support/onboarding'
import { completePreinstall } from '../support/preinstall'
import { SHELL_IFRAME } from '../support/selectors'

/** 冷装配（真的联网下载 Node + dsh）的等待上限。 */
const ASSEMBLY_TIMEOUT_MS = 900_000

/** 桌宠窗口创建/销毁的收敛窗口（Rust 侧建窗是异步的）。 */
const PET_WINDOW_TIMEOUT_MS = 30_000

/** 主窗口 label，同时也是 WebDriver 的 window handle。 */
const MAIN_WEBVIEW = 'main'

/** 桌宠独立窗口 label（`src-tauri/src/desktop/pet.rs:29`）。 */
const PET_WEBVIEW = 'pet'

/** 插件侧栏入口的稳定锚点（`packages/dsh-tauri-pet/src/client/constants/index.ts:38`）。 */
const PET_ICON = '[data-dsh-tauri-pet-icon]'

/** 桌宠尺寸合法区间（`src-tauri/src/desktop/pet.rs:48-49` 的 50.0 / 200.0）。 */
const PET_SIZE_MIN = 50
const PET_SIZE_MAX = 200
const PET_SIZE_DEFAULT = 100

interface PetStatus {
  enabled?: boolean
  visible?: boolean
  active_pet?: string
  pet_size?: number | null
}

/** 元素是否存在（选择器由调用方传入，`browser.execute` 不携带模块作用域）。 */
function elementExists(selector: string): boolean {
  return document.querySelector(selector) !== null
}

/** 元素的 `aria-pressed`。 */
function elementAriaPressed(selector: string): string | null {
  return document.querySelector(selector)?.getAttribute('aria-pressed') ?? null
}

/** 壳层内调用 Tauri 命令（帧内 invoke 会被 driver 的 execute 拦截器拒绝）。 */
function shellInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__: { invoke: (name: string, payload?: Record<string, unknown>) => Promise<unknown> }
  }).__TAURI_INTERNALS__
  if (internals === undefined)
    throw new Error('壳层缺少 __TAURI_INTERNALS__：当前上下文不是 Tauri WebView')
  return internals.invoke(cmd, args)
}

describe.skipIf(process.platform !== 'win32')('桌面端桌宠独立窗口', () => {
  let app: DesktopApp | undefined

  beforeAll(async () => {
    app = await startDesktopApp()
    const browser = app.browser
    const iframe = await browser.$(SHELL_IFRAME)
    await completePreinstall(browser, ASSEMBLY_TIMEOUT_MS)
    await iframe.waitForDisplayed({ timeout: ASSEMBLY_TIMEOUT_MS })
    await browser.switchFrame(iframe)
    await browser.waitUntil(
      () => browser.execute(elementExists, PET_ICON),
      { timeout: 60_000, timeoutMsg: '内嵌 dsh 界面未渲染出桌宠入口（插件 client 未生效）' },
    )
    await browser.switchFrame(null)
    await dismissDshModals(browser)
    await setEnabled(false)
  }, ASSEMBLY_TIMEOUT_MS)

  afterAll(async () => {
    await app?.stop()
  })

  /** 壳层读状态。 */
  async function status(): Promise<PetStatus> {
    return await app!.browser.execute(shellInvoke, 'get_pet_status') as PetStatus
  }

  /** 壳层写启用状态（只读→写在主线程外的命令，安全）。 */
  async function setEnabled(enabled: boolean): Promise<void> {
    await app!.browser.execute(shellInvoke, 'set_pet_enabled', { enabled })
    await app!.browser.waitUntil(
      async () => (await status()).enabled === enabled,
      { timeout: PET_WINDOW_TIMEOUT_MS, timeoutMsg: `把 enabled 写成 ${enabled} 后状态未收敛` },
    )
  }

  /** 等窗口句柄集合收敛到期望值。 */
  async function waitHandles(expected: string[], message: string): Promise<void> {
    await app!.browser.waitUntil(
      async () => {
        const handles = await app!.browser.getWindowHandles()
        return handles.length === expected.length && expected.every(handle => handles.includes(handle))
      },
      { timeout: PET_WINDOW_TIMEOUT_MS, timeoutMsg: message },
    )
  }

  /** 帧内点击侧栏桌宠入口（用户路径），返回点击前的 `aria-pressed`。 */
  async function clickSidebarIcon(): Promise<string | null> {
    const browser = app!.browser
    // 首屏引导弹层会把帧内 `#root` 设为 inert，吞掉所有指针事件；它挂载晚于服务就绪、
    // 且按帧内页面加载判定不落盘，因此每次交互前都要过一遍闸。
    await dismissDshModals(browser)
    const iframe = await browser.$(SHELL_IFRAME)
    await browser.switchFrame(iframe)
    try {
      const icon = await browser.$(PET_ICON)
      expect(await icon.isExisting(), '侧栏桌宠入口必须存在').toBe(true)
      const before = await browser.execute(elementAriaPressed, PET_ICON)
      await icon.click()
      return before
    }
    finally {
      await browser.switchFrame(null)
    }
  }

  it('TC-PET-L3-02-001 启用后出现独立的桌宠窗口', async () => {
    const browser = app!.browser
    await waitHandles([MAIN_WEBVIEW], '复位后窗口句柄必须恰为主窗口')

    expect(await clickSidebarIcon(), '点击前入口必须处于关闭态').toBe('false')
    await waitHandles([MAIN_WEBVIEW, PET_WEBVIEW], '点击侧栏入口后必须出现独立的 pet 窗口句柄')

    const state = await status()
    expect(state.enabled, '创建窗口后状态必须为 enabled:true').toBe(true)
    expect(state.visible, 'enabled 为真时 visible 必须同为真').toBe(true)

    await setEnabled(false)
    await waitHandles([MAIN_WEBVIEW], '关闭后窗口句柄必须回到只有 main')
  })

  it('TC-PET-L3-02-002 [反向] 未启用桌宠时不存在桌宠窗口', async () => {
    const browser = app!.browser
    await setEnabled(false)

    const state = await status()
    expect(state.enabled, '关闭态下必需为 false').toBe(false)
    expect(state.visible, '未启用时不得报告可见').toBe(false)
    expect(await browser.getWindowHandles(), '未启用时窗口句柄必须恰为 [main]').toEqual([MAIN_WEBVIEW])
  })

  it('TC-PET-L3-02-003 侧栏入口按钮切换后窗口随之创建与销毁', async () => {
    const browser = app!.browser
    await setEnabled(false)
    await waitHandles([MAIN_WEBVIEW], '复位后窗口句柄必须恰为主窗口')

    await clickSidebarIcon()

    await waitHandles([MAIN_WEBVIEW, PET_WEBVIEW], '首次点击后必须出现 pet 窗口')
    expect((await status()).enabled, '首次点击后状态必须为 enabled:true').toBe(true)

    await clickSidebarIcon()

    await waitHandles([MAIN_WEBVIEW], '二次点击后 pet 窗口必须销毁')
    expect((await status()).enabled, '二次点击后状态必须回到 enabled:false').toBe(false)
  })

  it('TC-PET-L3-02-004 桌宠尺寸边界：范围内接受、越界拒绝且不改状态', async () => {
    await setEnabled(true)

    for (const inRange of [PET_SIZE_MIN, PET_SIZE_MAX]) {
      await app!.browser.execute(shellInvoke, 'set_pet_size', { size: inRange })
      expect((await status()).pet_size, `范围内提交 ${inRange} 必须被接受并落盘`).toBe(inRange)
    }

    const settled = (await status()).pet_size
    for (const outOfRange of [0, PET_SIZE_MIN - 1, PET_SIZE_MAX + 1, 999]) {
      await expect(
        app!.browser.execute(shellInvoke, 'set_pet_size', { size: outOfRange }),
        `越界提交 ${outOfRange} 必须被拒绝（PET_SIZE_OUT_OF_RANGE），不得静默改写`,
      ).rejects.toThrow(/PET_SIZE_OUT_OF_RANGE/)
      expect(
        (await status()).pet_size,
        `越界提交 ${outOfRange} 不得改动已落盘的尺寸`,
      ).toBe(settled)
    }

    await app!.browser.execute(shellInvoke, 'set_pet_size', { size: PET_SIZE_DEFAULT })
    expect((await status()).pet_size, '收尾必须恢复默认尺寸').toBe(PET_SIZE_DEFAULT)
    await setEnabled(false)
  })
})
