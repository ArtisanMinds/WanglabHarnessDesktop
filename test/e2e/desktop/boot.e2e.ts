/**
 * test/e2e/desktop/boot.e2e.ts — 桌面端 L3 冒烟：进入下载装配 → dsh 内核启动 → 页面无报错。
 *
 * 桌面壳层的职责只有一件：把 dsh 装起来、跑起来、嵌进来。因此桌面端只保留这一条 E2E，
 * 断言四件事：
 *   ① 进入下载：本用例显式 `coldCache: true` 要一份**独占空缓存**，装配必须真的下载
 *      并落盘（Node 运行时 + dsh 本体），断言据此观察；`startDesktopApp()` 默认复用
 *      跨运行的共享缓存（`$DSH_E2E_DOWNLOAD_CACHE_DIR`），核心不再每次重下；
 *   ② 内核启动：`get_runtime_info().service_url` 指向本机端口，且壳层挂出 iframe——
 *      `src/layout/components/iframe.tsx` 只在 `harness.serviceHealthy` 为真时挂载；
 *   ③ dsh 页面出现：进帧（跨域，靠仓库 vendor 补丁的 `ICoreWebView2Frame2::ExecuteScript`）
 *      断言 `#root`（`@deepseek-ai/dsh-web-frontend` 的挂载点）渲染出内容；
 *   ④ 页面无报错：壳层从会话建立起收集 `error` / `unhandledrejection` / `console.error`，
 *      帧内在页面渲染后收集同一组，断言两者皆空；壳层另断言没有落到装配失败页。
 *
 * 帧内收集器只能在「已经进入帧」之后安装，因此**加载期**的帧内报错不在覆盖范围内；
 * 那一段由 ②③（iframe 挂载 + `#root` 渲染）与壳层的失败页断言兜底。
 *
 * 编排：`test/e2e/support/desktop-host.ts`；预装引导：`test/e2e/support/preinstall.ts`。
 *
 * 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/boot.e2e.ts`
 * 本机若已有桌面实例占着 WebDriver 4445，加 `TAURI_WEBDRIVER_PORT=<空闲端口>` 即可另开一路。
 */

import type { DesktopApp } from '../support/desktop-host'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDesktopApp } from '../support/desktop-host'
import { completePreinstall } from '../support/preinstall'
import { SETUP_ERROR, SHELL_IFRAME, SHELL_ROOT } from '../support/selectors'

/** 冷装配（真的联网下载 Node + dsh）的等待上限。 */
const ASSEMBLY_TIMEOUT_MS = 900_000

/** dsh 页面挂载点（`dsh-web-frontend/dist/index.html` 的 `<div id="root">`）。 */
const DSH_ROOT = '#root'

/** 页面渲染后留给插件异步加载收敛的观察窗口。 */
const SETTLE_MS = 3_000

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

/**
 * 帧内 dsh 页面是否已渲染出内容。
 *
 * 选择器必须由调用方以参数传入：`browser.execute` 只序列化函数体，
 * 模块级常量在页面上下文里并不存在（引用即 `DSH_ROOT is not defined`）。
 */
function dshRootRendered(selector: string): boolean {
  return (document.querySelector(selector)?.childElementCount ?? 0) > 0
}

/** `#root` 的文本（不含 `<script>` 源码，用来区分「渲染出界面」与「白屏」）。 */
function dshRootText(selector: string): string {
  return document.querySelector(selector)?.textContent?.trim() ?? ''
}

describe.skipIf(process.platform === 'darwin')('桌面端启动冒烟', () => {
  let app: DesktopApp | undefined
  let browser: WebdriverIO.Browser

  beforeAll(async () => {
    app = await startDesktopApp({ coldCache: true })
    browser = app.browser
    // 尽早装壳层收集器：装配失败、iframe 加载失败都会在壳层留下痕迹
    await browser.execute(collectPageErrors)
    // 首次装配要先过「安装推荐插件」引导，服务才会被拉起（引导自身不在本用例范围）
    await completePreinstall(browser, ASSEMBLY_TIMEOUT_MS)
    await (await browser.$(SHELL_IFRAME)).waitForDisplayed({ timeout: ASSEMBLY_TIMEOUT_MS })
  }, ASSEMBLY_TIMEOUT_MS)

  afterAll(async () => {
    await app?.stop()
  })

  it('TC-DSK-L3-01-001 进入下载装配后 dsh 内核启动、页面渲染且无报错', async () => {
    // ① 进入下载：本用例显式要一份**独占空缓存**（`coldCache: true`），装配必须真的下载并落盘
    // （`startDesktopApp()` 默认复用跨运行的共享缓存，核心不再每次重下）
    // （Node 可能直接复用系统安装，`<cache>/runtime` 因此不保证存在，故不据此断言）
    const cacheDir = app?.downloadCacheDir ?? ''
    expect(existsSync(join(cacheDir, 'dependencies', 'dsh')), 'dsh 本体未落盘（装配没走下载）').toBe(true)

    // ② 内核启动：Node 运行时可用 + 服务地址 + iframe 挂载（后者只在 serviceHealthy 时发生）
    const info = await browser.execute(async () => {
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string) => Promise<{ service_url: string, node_version: string }>
        }
      }).__TAURI_INTERNALS__
      return await internals.invoke('get_runtime_info')
    })
    expect(info.node_version, '未解析到可用 Node 运行时').not.toBe('')
    expect(info.service_url, '内核未给出服务地址').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const iframe = await browser.$(SHELL_IFRAME)
    expect(await iframe.isDisplayed(), 'iframe 未挂载（内核未就绪）').toBe(true)
    expect(await iframe.getAttribute('src'), 'iframe 未指向内核服务地址').toContain(info.service_url)
    expect(await (await browser.$(SHELL_ROOT)).isExisting(), '壳层根节点缺失').toBe(true)
    expect(await (await browser.$(SETUP_ERROR)).isExisting(), '壳层停在装配失败页').toBe(false)

    // ③ dsh 页面出现：进帧断言挂载点渲染出内容
    let rendered = ''
    let frameErrors: string[] = []
    await browser.switchFrame(iframe)
    try {
      await browser.execute(collectPageErrors)
      await browser.waitUntil(
        () => browser.execute(dshRootRendered, DSH_ROOT),
        { timeout: 60_000, timeoutMsg: 'dsh 页面未渲染（#root 无子节点）' },
      )
      // 页面渲染后仍有插件在异步加载，留一个观察窗口再取快照
      await browser.pause(SETTLE_MS)
      rendered = await browser.execute(dshRootText, DSH_ROOT) as string
      frameErrors = await browser.execute(readPageErrors) as string[]
    }
    finally {
      // 无论成功与否都退回顶层，否则收尾的壳层断言会跑在帧上下文里
      await browser.switchFrame(null)
    }
    expect(rendered.length, 'dsh 页面渲染为空（白屏）').toBeGreaterThan(0)

    // ④ 页面无报错：帧内与壳层的收集器都必须为空
    expect(frameErrors, 'dsh 页面出现报错').toEqual([])
    const shellErrors = await browser.execute(readPageErrors) as string[]
    expect(shellErrors, '壳层出现报错').toEqual([])
  }, ASSEMBLY_TIMEOUT_MS)
})
