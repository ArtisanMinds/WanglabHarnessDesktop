/**
 * test/e2e/support/desktop-host.ts — L3 桌面端 E2E 的宿主编排。
 *
 * 目标：把「真实 Debug 二进制 + WDIO 会话」变成一行 `startDesktopApp()`。
 *
 * 与插件 L2 的 `dsh-host.ts` 的关键区别：应用由 `@wdio/tauri-service` 的 embedded
 * provider 自己 spawn（它注入 `TAURI_WEBDRIVER_PORT` 并轮询应用内嵌的 WebDriver server），
 * 本文件只负责前置校验、环境隔离与收尾。
 *
 * 隔离：dsh 数据目录由 `get_dsh_data_path()` 决定，它读 `USERPROFILE`/`HOME` 并
 * 忽略 `DSH_HOME`（`src-tauri/src/config/runtime.rs:471`）；`app_data_dir()` 同源
 * 派生。因此只重定向 home 根即可隔离，绝不写用户真实的 `~/.dsh.dev` 与 Store。
 */

import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { cleanupWdioSession, createTauriCapabilities, startWdioSession } from '@wdio/tauri-service'

// ============================================================================
// 常量定义
// ============================================================================

/** 仓库根（本文件位于 `<root>/test/e2e/support/`）。 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** Debug 构建的固定端口（`src-tauri/src/config/constants.rs:53`）。 */
export const APP_PORT = 3081

/** 应用主窗口标题（`src-tauri/src/desktop/builder.rs:484`）。 */
export const APP_TITLE = 'Deepseek Harness Desktop'

/**
 * 主窗口的 webview label，同时也是 WebDriver 的 window handle
 * （`src-tauri/src/desktop/builder.rs` 的 `WebviewWindowBuilder::new(app, "main", ...)`）。
 */
export const MAIN_WEBVIEW = 'main'

/**
 * 应用内嵌 WebDriver server 的固定端口（`@wdio/tauri-service` 的 embedded provider 默认 4445，
 * 应用侧由 `TAURI_WEBDRIVER_PORT` 门控）。
 */
export const WEBDRIVER_PORT = 4445

/** 下载缓存根：跨运行复用，**不随 scratch home 删除**。 */
export const DOWNLOAD_CACHE_DIR = join(tmpdir(), 'dsh-e2e-download-cache')

/** 残留实例的进程名（按 `productName` 推导）。 */
const APP_PROCESS_NAME = 'deepseek-harness-desktop'

/** E2E 模式下的 Store 文件名（`config::setting::store_dat_file_name` 的测试分支）。 */
const TEST_STORE_FILE = '.store.test.dat'

/** scratch home 的目录前缀。 */
const SCRATCH_PREFIX = 'dsh-e2e-desktop-'

/** 只清理超过该年龄的残留：足够避开并发会话正在使用的 scratch (30 分钟)。 */
const STALE_HOME_AGE_MS = 30 * 60 * 1000

/** WDIO 会话建立上限。 */
const SESSION_TIMEOUT_MS = 120_000

// ============================================================================
// 类型接口
// ============================================================================

export interface StartDesktopAppOptions {
  /** 覆盖二进制路径（用例 007 用它构造「路径不存在」）。 */
  appBinaryPath?: string
  /** 期望二进制存在；`false` 时跳过存在性校验（用于反向用例）。 */
  requireBinary?: boolean
  /** 保留 `$E2E_HOME`（调试用）。 */
  keepHome?: boolean
  /**
   * 本次运行禁用自动下载（`DSH_E2E_DISABLE_DOWNLOAD=1`）。
   *
   * 默认不禁用：应用照常走安装/联网核对。只验壳层、不关心装配流程的用例
   * 可置位以省流量；覆盖启动 setup 流程的用例必须保持 `false`。
   */
  disableDownload?: boolean
  /** 覆盖下载缓存根（默认 `DOWNLOAD_CACHE_DIR`）。 */
  downloadCacheDir?: string
}

export interface DesktopApp {
  /** 已建立的 WDIO 会话。 */
  readonly browser: WebdriverIO.Browser
  /** 本次运行独占的隔离根。 */
  readonly home: string
  /** 应用二进制实际路径。 */
  readonly binaryPath: string
  /** 结束会话并清理隔离根（幂等）。 */
  readonly stop: () => Promise<void>
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 起一个真实桌面应用并建立 WDIO 会话。
 */
export async function startDesktopApp(options: StartDesktopAppOptions = {}): Promise<DesktopApp> {
  const {
    requireBinary = true,
    keepHome = false,
    disableDownload = false,
    downloadCacheDir = DOWNLOAD_CACHE_DIR,
  } = options

  const binaryPath = options.appBinaryPath ?? defaultBinaryPath()

  if (requireBinary) {
    await assertPreconditions({ binaryPath })
  }

  // 触发异步垃圾回收清理（不阻塞当前应用启动）
  void purgeStaleHomes()
  resetTestStore()

  const home = makeHome(keepHome)

  // 禁用下载的运行绝不会**写**缓存，却会**读**它：共享缓存里若已有一份可用的
  // Node/dsh/pnpm，`runtime_ready()` 会为真，装配流程随之分叉（不再停在
  // 「找不到 dsh CLI」），禁用页与「无 iframe 接收方」的断言就变成依赖上一次
  // 运行的运气。因此禁用下载且调用方没指定缓存时，改用本次运行独占的空目录，
  // 收尾随 scratch home 一起删除。
  const cacheDir = disableDownload && options.downloadCacheDir === undefined
    ? join(home, 'download-cache')
    : downloadCacheDir
  mkdirSync(cacheDir, { recursive: true })

  const profile = join(home, 'home')
  const env: Record<string, string> = {
    USERPROFILE: profile,
    HOME: profile,
    DSH_DOWNLOAD_CACHE_DIR: cacheDir,
    ...(disableDownload ? { DSH_E2E_DISABLE_DOWNLOAD: '1' } : {}),
  }

  const capabilities = createTauriCapabilities(binaryPath, {
    driverProvider: 'embedded',
    startTimeout: SESSION_TIMEOUT_MS,
  })

  capabilities['wdio:tauriServiceOptions'] = {
    ...capabilities['wdio:tauriServiceOptions'],
    env,
    startTimeout: SESSION_TIMEOUT_MS,
  }

  log(`拉起应用：${binaryPath}（E2E_HOME=${home}）`)

  const startedAt = Date.now()
  let browser: WebdriverIO.Browser | undefined
  let stopped = false

  const stop = async (): Promise<void> => {
    if (stopped)
      return
    stopped = true

    if (browser !== undefined) {
      try {
        await cleanupWdioSession(browser)
      }
      catch (error) {
        log(`会话清理告警：${(error as Error).message}`)
      }
    }

    if (keepHome)
      return

    // 探测 WebDriver 端口以等待 WebView2 子进程释放资源
    for (let i = 0; i < 20 && (await isPortBusy(WEBDRIVER_PORT)); i++) {
      await sleep(150)
    }

    // 带退避重试删除临时工作目录
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        rmSync(home, { recursive: true, force: true })
        log(`收尾完成（${Date.now() - startedAt}ms）`)
        return
      }
      catch (error) {
        if (attempt === 3) {
          log(`scratch 未删除（残留 ${home}）：${(error as Error).message}`)
          return
        }
        await sleep(200)
      }
    }
  }

  try {
    browser = await startWdioSession(capabilities, { rootDir: REPO_ROOT })
    await focusMainWindow(browser)
    log(`应用就绪（${Date.now() - startedAt}ms）`)
    return { browser, home, binaryPath, stop }
  }
  catch (error) {
    await stop()
    throw error
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function log(message: string): void {
  process.stderr.write(`[desktop-host] ${message}\n`)
}

/** 默认二进制路径。 */
export function defaultBinaryPath(): string {
  const exeSuffix = process.platform === 'win32' ? '.exe' : ''
  return join(REPO_ROOT, 'src-tauri', 'target', 'debug', `${APP_PROCESS_NAME}${exeSuffix}`)
}

/** 端口是否已被监听。 */
export function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const cleanup = (busy: boolean): void => {
      socket.destroy()
      resolve(busy)
    }
    socket.setTimeout(1_000)
    socket.once('connect', () => cleanup(true))
    socket.once('timeout', () => cleanup(false))
    socket.once('error', () => cleanup(false))
  })
}

/** 应用真实 app-data 目录（`SHGetKnownFolderPath` 解析，环境变量改不动它）。 */
function getAppDataDir(): string {
  const roaming = process.env.APPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming')
  return join(roaming, 'io.github.hairyf.deepseek-harness-desktop')
}

/** 执行 PowerShell 命令的轻量辅助封装。 */
function execPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer | string) => {
      output += chunk.toString()
    })
    child.once('error', () => resolve(''))
    child.once('close', () => resolve(output))
  })
}

/**
 * 指定二进制是否仍有存活进程。
 * 按**可执行文件路径**比对，避免误判正式版实例。
 */
async function hasLiveProcess(binaryPath: string): Promise<boolean> {
  if (process.platform !== 'win32')
    return false

  const script = `Get-CimInstance Win32_Process -Filter "Name='${APP_PROCESS_NAME}.exe'" | Select-Object -ExpandProperty ExecutablePath`
  const output = await execPowerShell(script)
  const target = binaryPath.toLowerCase()

  return output
    .split(/\r?\n/)
    .some(line => line.trim().toLowerCase() === target)
}

// ============================================================================
// 前置校验与状态清理
// ============================================================================

/**
 * 前置校验：不满足即 fail，**不自动强杀用户进程**。
 */
export async function assertPreconditions(options: { port?: number, binaryPath?: string } = {}): Promise<void> {
  const port = options.port ?? APP_PORT
  const binaryPath = options.binaryPath ?? defaultBinaryPath()

  if (!existsSync(binaryPath)) {
    throw new Error(
      `二进制不存在：${binaryPath}；先在 src-tauri/ 下运行 \`tauri build --debug --no-bundle\`（必须带 custom-protocol，否则应用走 devUrl 而不嵌 dist）。`,
    )
  }

  if (await isPortBusy(port)) {
    throw new Error(`端口 ${port} 已被监听（debug 固定端口）；请先停掉 dev/debug 实例。本校验不自动杀进程。`)
  }

  if (await isPortBusy(WEBDRIVER_PORT)) {
    throw new Error(
      `WebDriver 端口 ${WEBDRIVER_PORT} 已被占用（多半是另一个桌面实例在跑）；此时会话会静默挂到对方的窗口上，必须先释放。本校验不自动杀进程。`,
    )
  }

  if (await hasLiveProcess(binaryPath)) {
    throw new Error(`检测到残留桌面实例（${binaryPath}）；请先关闭后再跑 E2E。本校验不自动杀进程。`)
  }
}

/** 清空测试 Store。 */
export function resetTestStore(): void {
  const file = join(getAppDataDir(), TEST_STORE_FILE)
  rmSync(file, { force: true })
}

/** 清空下载缓存，回到「首次装配」状态。 */
export function resetDownloadCache(dir: string = DOWNLOAD_CACHE_DIR): void {
  rmSync(dir, { recursive: true, force: true })
}

let isStaleHomesPurged = false

/**
 * 异步清理历史运行残留的 scratch home（每个进程只执行一次，非阻塞）。
 */
export async function purgeStaleHomes(): Promise<void> {
  if (isStaleHomesPurged)
    return
  isStaleHomesPurged = true

  const root = tmpdir()
  const deadline = Date.now() - STALE_HOME_AGE_MS
  let removedCount = 0

  try {
    const entries = await readdir(root)
    for (const entry of entries) {
      if (!entry.startsWith(SCRATCH_PREFIX))
        continue
      const targetPath = join(root, entry)

      try {
        const stats = await stat(targetPath)
        if (stats.mtimeMs <= deadline) {
          await rm(targetPath, { recursive: true, force: true })
          removedCount++
        }
      }
      catch {
        // 忽略单个目录清理失败（仍被占用或无权限）
      }
    }
  }
  catch {
    // 忽略读取临时根目录失败
  }

  if (removedCount > 0) {
    log(`清理历史 scratch：${removedCount} 个`)
  }
}

/** 建隔离根并派生 home 根。 */
function makeHome(keep: boolean): string {
  const home = join(tmpdir(), `${SCRATCH_PREFIX}${Date.now().toString(36)}`)
  const profile = join(home, 'home')

  mkdirSync(join(profile, 'AppData', 'Local'), { recursive: true })
  mkdirSync(join(profile, 'AppData', 'Roaming'), { recursive: true })

  if (keep)
    log(`KEEP_HOME：${home}`)
  return home
}

/** 把会话切到主窗口（webview label `main`）。 */
async function focusMainWindow(browser: WebdriverIO.Browser): Promise<void> {
  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles()
      return handles.includes(MAIN_WEBVIEW)
    },
    { timeout: 30_000, timeoutMsg: `未找到主窗口 webview：${MAIN_WEBVIEW}` },
  )

  await browser.switchToWindow(MAIN_WEBVIEW)
}
