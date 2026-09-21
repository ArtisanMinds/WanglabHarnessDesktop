/**
 * 批次 02 的 L3 段 · `dsh-tauri-pet` 的**独立桌宠窗口**（契约见 `docs/specs/desktop.test.md`
 * 与 `docs/specs/plugin.test.md`；用例编号 `TC-PET-L3-02-001..004`）。
 *
 * 为什么这一段的运行归属是 `desktop` 车道而不是 `plugin` 车道：四条断言的对象都是
 * **Tauri 原生产物**——独立 OS 窗口句柄集合（`main` / `pet`）、窗口创建与销毁、尺寸边界的
 * 命令级拒绝。这些在纯浏览器里不可能观测，而 `plugin` 车道的 CI 作业跑在 ubuntu-latest、
 * 没有 Tauri；把用例留在插件文件里就等于「写了却永不执行」。
 *
 * 前置：Windows + `pnpm build:debug`。运行：
 * `node node_modules/vitest/vitest.mjs run --project desktop test/e2e/desktop/02-pet-window.e2e.ts`
 * （本机若已有桌面实例占着 WebDriver 4445，用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路。）
 *
 * 命令通道（实测确定的唯一可行路径）：**帧内** `__TAURI_INTERNALS__.invoke` 会被
 * `@wdio/tauri-service` 的 execute 拦截器判为「未知插件」而拒绝，因此命令一律在
 * **壳层**（`main` webview，`http://tauri.localhost/`）里调用——那里的 `invoke` 直连
 * Rust。启用/关闭走侧栏入口的真实点击（用户路径），只读状态走壳层 `get_pet_status`。
 * 窗口句柄集合经 `getWindowHandles()` 读取，是「独立 OS 窗口是否真的存在」的外部证据。
 *
 * 报错采集（与 `boot.e2e.ts` 同源）：壳层在 `startDesktopApp()` 之后立即装收集器，帧内在
 * 进入 iframe 后装同一个收集器；001/003/004 三条点击驱动的用例在收尾断言两边都为空。
 * 盲区与 `desktop.test.md` 一致：**只能在进入上下文之后安装**，因此帧内与 `pet` WebView 的
 * 加载期报错不可观测（后者由「窗口句柄真的出现 / 消失 + 命令级状态收敛」间接兜底）。
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

/**
 * 在页面（壳层或帧内）安装报错收集器：三类页面级错误收进 `window.__dshE2eErrors`。
 *
 * 只装一次；`console.error` 保留原实现，收集不改变页面行为。
 */
function collectPageErrors(): void {
  const host = window as unknown as { __dshE2eErrors?: string[] }
  if (host.__dshE2eErrors)
    return

  const errors: string[] = []
  host.__dshE2eErrors = errors
  window.addEventListener('error', event => errors.push(`error: ${event.message}`))
  window.addEventListener('unhandledrejection', event => errors.push(`unhandledrejection: ${String(event.reason)}`))

  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    errors.push(`console.error: ${args.map(String).join(' ')}`)
    original(...args)
  }
}

/** 读回当前上下文的报错收集器；收集器不存在时返回空数组。 */
function readPageErrors(): string[] {
  return (window as unknown as { __dshE2eErrors?: string[] }).__dshE2eErrors ?? []
}

/** 元素的 `aria-pressed`。 */
function elementAriaPressed(selector: string): string | null {
  return document.querySelector(selector)?.getAttribute('aria-pressed') ?? null
}

/** 壳层内调用 Tauri 命令（帧内 invoke 会被 driver 的 execute 拦截器拒绝）。 */
function shellInvoke(cmd: string, args?: unknown): Promise<unknown> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__: { invoke: (name: string, payload?: Record<string, unknown>) => Promise<unknown> }
  }).__TAURI_INTERNALS__
  if (internals === undefined)
    throw new Error('壳层缺少 __TAURI_INTERNALS__：当前上下文不是 Tauri WebView')
  return internals.invoke(cmd, args as Record<string, unknown> | undefined)
}

describe.skipIf(process.platform !== 'win32')('桌面端桌宠独立窗口', () => {
  let app: DesktopApp | undefined

  beforeAll(async () => {
    app = await startDesktopApp()
    const browser = app.browser
    // 尽早装壳层收集器：装配失败、iframe 加载失败都会在壳层留下痕迹
    await browser.execute(collectPageErrors)
    const iframe = await browser.$(SHELL_IFRAME)
    await completePreinstall(browser, ASSEMBLY_TIMEOUT_MS)
    await iframe.waitForDisplayed({ timeout: ASSEMBLY_TIMEOUT_MS })
    await browser.switchFrame(iframe)
    // 帧内收集器只能在进入帧之后安装，因此加载期报错不在覆盖范围内
    await browser.execute(collectPageErrors)
    await browser.waitUntil(
      () => browser.execute(elementExists, PET_ICON),
      { timeout: 60_000, timeoutMsg: '内嵌 dsh 界面未渲染出桌宠入口（插件 client 未生效）' },
    )
    await browser.switchFrame(null)
    await dismissDshModals(browser)
    await setEnabled(false)
  }, ASSEMBLY_TIMEOUT_MS)

  /** 壳层报错快照（当前上下文必须已在壳层）。 */
  async function shellErrors(): Promise<string[]> {
    return await app!.browser.execute(readPageErrors) as string[]
  }

  /** 帧内报错快照：自行进出 iframe，调用方不必关心当前上下文。 */
  async function frameErrors(): Promise<string[]> {
    const browser = app!.browser
    const iframe = await browser.$(SHELL_IFRAME)
    await browser.switchFrame(iframe)
    try {
      return await browser.execute(readPageErrors) as string[]
    }
    finally {
      await browser.switchFrame(null)
    }
  }

  /** 收尾断言：壳层与内嵌 dsh 页面都不得留下未捕获错误。 */
  async function expectNoPageErrors(scene: string): Promise<void> {
    expect(await frameErrors(), `${scene}：内嵌 dsh 页面出现报错`).toEqual([])
    expect(await shellErrors(), `${scene}：壳层出现报错`).toEqual([])
  }

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

  /**
   * 越界提交必须由命令层拒绝（`src-tauri/src/bridge/pet.rs:217-222` 返回
   * `PET_SIZE_OUT_OF_RANGE: pet size percent must be within 50..=200`，**不夹紧**）。
   *
   * 断言形态与普通失败调用一致，但先把传输层重试降到 0：内嵌 driver 把脚本错误回成
   * `500 javascript error`（`src-tauri/vendor/tauri-plugin-wdio-webdriver/src/server/response.rs:93-105`），
   * 而 `webdriver@9.31.9` 把 500 列进 `RETRYABLE_STATUS_CODES`，`_request` 会按
   * `min(10s, 250ms * 2^n)` 退避重试 10 次——单次拒绝就要 ~46s（实测 14:00:04.2 → 14:00:50.2），
   * 4 个越界值必然撞上 180s 用例超时；页面内 `try/catch` 拦不住它（实测同样 500，
   * 因为 invoke 的失败由 driver 在响应层判定，不在页面 promise 链上）。
   * `connectionRetryCount` 是 WDIO 公开会话选项（`webdriver` 默认 3，服务侧写 10），
   * 只在这一次拒绝期间置 0、`finally` 立即还原：其余用例的重试韧性不受影响。
   */
  async function expectSizeRejected(outOfRange: number): Promise<void> {
    const browser = app!.browser
    const retryCount = browser.options.connectionRetryCount
    browser.options.connectionRetryCount = 0
    try {
      await expect(
        browser.execute(shellInvoke, 'set_pet_size', { size: outOfRange }),
      ).rejects.toThrow(/PET_SIZE_OUT_OF_RANGE/)
    }
    finally {
      browser.options.connectionRetryCount = retryCount
    }
  }

  /** 帧内读入口两态（`aria-pressed` 由 `syncIconState` 按 store 写入）。 */
  async function iconAriaPressed(): Promise<string | null> {
    const browser = app!.browser
    const iframe = await browser.$(SHELL_IFRAME)
    await browser.switchFrame(iframe)
    try {
      return await browser.execute(elementAriaPressed, PET_ICON)
    }
    finally {
      await browser.switchFrame(null)
    }
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

  /**
   * 点一次侧栏入口，并把「点击前两态」与「窗口句柄集合」一起对上。
   *
   * `expectBefore` 是必需的前置：入口两态只来自客户端 store，而 store 没有任何带外订阅
   * ——`pet://status` 由 Rust 只 `emit_to(PET_WINDOW_LABEL)`（`src-tauri/src/bridge/pet.rs`），
   * iframe 侧既不监听它、`loadPetStatus()` 也只在注册时拉一次（`sidebar-icon.ts:71-73`）。
   * 于是壳层/其他窗口写 `set_pet_enabled` 之后入口会停在旧值，此时一次点击算出的目标是
   * `enabled:!旧值`，可能只是一次幂等写（**用户点了没反应**）。这条断言把该前提显式化：
   * 前置不一致就直接指出「入口 store 与后端失同步」，而不是伪装成窗口 bug。
   */
  async function clickIconToggling(expectBefore: string, expected: string[], message: string): Promise<void> {
    expect(
      await clickSidebarIcon(),
      `点击前入口 aria-pressed 必须为 ${expectBefore}（不一致即入口 store 与后端失同步）`,
    ).toBe(expectBefore)
    await waitHandles(expected, message)
  }

  it('TC-PET-L3-02-001 启用后出现独立的桌宠窗口', async () => {
    await waitHandles([MAIN_WEBVIEW], '复位后窗口句柄必须恰为主窗口')

    await clickIconToggling('false', [MAIN_WEBVIEW, PET_WEBVIEW], '点击侧栏入口后必须出现独立的 pet 窗口句柄')

    const state = await status()
    expect(state.enabled, '创建窗口后状态必须为 enabled:true').toBe(true)
    expect(state.visible, 'enabled 为真时 visible 必须同为真').toBe(true)

    // 清理必须走点击这条同源路径：壳层带外改写会把入口 store 留在 true，下一条点击驱动的
    // 用例（003）首次点击就成了幂等写、窗口不会出现——上一轮 003 失败的实测原因。
    await clickIconToggling('true', [MAIN_WEBVIEW], '再次点击入口后 pet 窗口必须销毁')
    expect((await status()).enabled, '关闭后状态必须回到 enabled:false').toBe(false)

    await expectNoPageErrors('TC-PET-L3-02-001 建窗/销毁全流程')
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
    await setEnabled(false)
    await waitHandles([MAIN_WEBVIEW], '复位后窗口句柄必须恰为主窗口')
    expect(await iconAriaPressed(), '复位后入口两态必须停在关闭态').toBe('false')

    await clickIconToggling('false', [MAIN_WEBVIEW, PET_WEBVIEW], '首次点击后必须出现 pet 窗口')
    expect((await status()).enabled, '首次点击后状态必须为 enabled:true').toBe(true)

    await clickIconToggling('true', [MAIN_WEBVIEW], '二次点击后 pet 窗口必须销毁')
    expect((await status()).enabled, '二次点击后状态必须回到 enabled:false').toBe(false)

    await expectNoPageErrors('TC-PET-L3-02-003 点击切换往返')
  })

  it('TC-PET-L3-02-004 桌宠尺寸边界：范围内接受、越界拒绝且不改状态', async () => {
    await setEnabled(true)

    for (const inRange of [PET_SIZE_MIN, PET_SIZE_MAX]) {
      await app!.browser.execute(shellInvoke, 'set_pet_size', { size: inRange })
      expect((await status()).pet_size, `范围内提交 ${inRange} 必须被接受并落盘`).toBe(inRange)
    }

    const settled = (await status()).pet_size
    for (const outOfRange of [0, PET_SIZE_MIN - 1, PET_SIZE_MAX + 1, 999]) {
      await expectSizeRejected(outOfRange)
      expect(
        (await status()).pet_size,
        `越界提交 ${outOfRange} 不得改动已落盘的尺寸`,
      ).toBe(settled)
    }

    await app!.browser.execute(shellInvoke, 'set_pet_size', { size: PET_SIZE_DEFAULT })
    expect((await status()).pet_size, '收尾必须恢复默认尺寸').toBe(PET_SIZE_DEFAULT)
    await setEnabled(false)

    await expectNoPageErrors('TC-PET-L3-02-004 尺寸边界')
  })
})
