/**
 * test/e2e/support/dsh-host.ts — 插件 L2 E2E 的宿主编排。
 *
 * 目标：把「真实 dsh web 进程 + 真实插件挂载」这件事变成一行 `startDshHost()`。
 * 全程只写本调用独占的 scratch 目录，绝不触碰 ~/.dsh 与 ~/.dsh.dev。
 *
 * 流程：scratch DSH_HOME → 脚手架 profile → 把插件链接进 profile/node_modules
 * → 写 dsh.profile.bundles → dsh web --port 0 → 从日志解析就绪 URL。
 *
 * 挂载方式由 DSH_E2E_MOUNT 选择：
 *   link（默认）：自建目录链接，离线、快，不碰 pnpm store；
 *   cli：走真实 `dsh plugin --profile web add link:<pkg>`（需要网络与 pnpm）。
 */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** 仓库根（本文件位于 `<root>/test/e2e/support/`）。 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** scratch profile 名：与桌面端一致（`dsh web` 默认档案）。 */
const PROFILE = 'web'

/**
 * 就绪行正则：只取 URL 本体（`dsh web: ` 前缀留在匹配之外，否则 `new URL()` 会抛）。
 * 必须吃到空白为止——在 `/` 处截断会丢掉 `?token=`，首屏直接 401。
 */
const READY_RE = /http:\/\/127\.0\.0\.1:\d\S*/

/** 就绪等待上限（冷启 dsh web + 插件装配）。 */
const READY_TIMEOUT_MS = 120_000

/** 桌面端已装配的 dsh 入口（无 PATH 上的 dsh 时的兜底）。 */
const ASSEMBLED_DSH = join(
  process.env.APPDATA ?? '',
  'io.github.hairyf.deepseek-harness-desktop',
  'dependencies',
  'dsh',
  'node_modules',
  '@deepseek-ai',
  'dsh',
  'lib',
  'bin.js',
)

export interface StartDshHostOptions {
  /** 要挂载的包名，如 `dsh-tauri-pet`。 */
  plugin: string
  /** 额外挂载的包名（依赖插件，如 `dsh-tauri`）。 */
  also?: readonly string[]
  /** 保留 scratch 目录（调试用）。 */
  keepHome?: boolean
}

export interface DshHost {
  /** 带一次性 token 的就绪 URL；`baseUrl` 用于 HTTP 断言。 */
  readonly url: string
  /** 裸 origin（`http://127.0.0.1:<port>`）。 */
  readonly baseUrl: string
  /**
   * 用就绪 URL 的一次性 token 换来的浏览器会话 Cookie（`name=value`）。
   */
  readonly cookie: string
  /** 本次调用独占的 DSH_HOME。 */
  readonly home: string
  /** dsh web 的 stdout+stderr 日志文件。 */
  readonly logPath: string
  /** 已挂载的包名（含 base 与 also）。 */
  readonly mounted: readonly string[]
  /** 停止服务并清理 scratch（幂等）。 */
  stop: () => Promise<void>
}

/* ==========================================
 * 通用/基础工具函数 (Utils)
 * ========================================== */

function log(message: string): void {
  process.stderr.write(`[dsh-host] ${message}\n`)
}

function resolveNodeBin(): string {
  return process.env.DSH_E2E_NODE_BIN ?? process.execPath
}

/** 通用 JSON 读取，带容错兜底 */
function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  }
  catch {
    return null
  }
}

/** 修改并回写 JSON 文件 */
function updateJson<T>(filePath: string, updater: (data: T) => T): void {
  const data = readJson<T>(filePath) ?? ({} as T)
  const nextData = updater(data)
  writeFileSync(filePath, `${JSON.stringify(nextData, null, 2)}\n`)
}

/** 读日志全文；文件不存在或读取异常时返回空字符串 */
function readLog(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  }
  catch {
    return ''
  }
}

function tailOf(path: string, lines = 30): string {
  const text = readLog(path)
  if (!text)
    return '(日志为空)'
  return text.split('\n').slice(-lines).join('\n')
}

/* ==========================================
 * 业务逻辑与依赖解析
 * ========================================== */

/** 解析 dsh 入口：显式环境变量 → PATH 上的 `dsh` → 桌面端已装配的 bin.js。 */
function resolveDshCommand(): string[] {
  const explicit = process.env.DSH_E2E_DSH_BIN
  if (explicit)
    return [explicit]

  try {
    return [require.resolve('@deepseek-ai/dsh/lib/bin.js')]
  }
  catch {
    // 仓库不把 dsh CLI 作为依赖安装：它是运行期产物
  }

  if (existsSync(ASSEMBLED_DSH)) {
    log(`使用桌面端已装配的 dsh：${ASSEMBLED_DSH}`)
    return [ASSEMBLED_DSH]
  }

  throw new Error(
    'DSH_E2E_DSH_BIN 未设置，PATH 与桌面端装配目录都没有 dsh 入口；'
    + '请设置 DSH_E2E_DSH_BIN 指向 @deepseek-ai/dsh 的 lib/bin.js',
  )
}

/** 读包版本号；读不到返回 `0.0.0`（仅用于日志）。 */
function packageVersion(pkgDir: string): string {
  interface Manifest { version?: string }
  return readJson<Manifest>(join(pkgDir, 'package.json'))?.version ?? '0.0.0'
}

/** 校验插件已构建 */
function assertBuilt(pkgDir: string, pkg: string): void {
  interface Manifest {
    main?: string
    exports?: Record<string, unknown>
  }
  const manifest = readJson<Manifest>(join(pkgDir, 'package.json')) ?? {}
  const main = manifest.main ?? './dist/index.js'
  const hostEntry = join(pkgDir, main.replace(/^\.\//, ''))

  if (!existsSync(hostEntry)) {
    throw new Error(
      `${pkg} 尚未构建：缺少 ${hostEntry}。先跑一次 \`pnpm build:plugins\`（或 \`pnpm --filter ${pkg} build\`）。`,
    )
  }

  const client = manifest.exports?.['./client']
  const clientEntry = typeof client === 'string'
    ? client
    : (client as { default?: string } | undefined)?.default

  if (clientEntry !== undefined && !existsSync(join(pkgDir, clientEntry.replace(/^\.\//, '')))) {
    throw new Error(`${pkg} 的 client 产物缺失：${clientEntry}；先跑一次 \`pnpm build:plugins\`。`)
  }
}

/** 写 scratch profile 三件套（镜像 dsh 的 profile 模板）。 */
function writeProfile(profileDir: string, bundles: readonly string[]): void {
  mkdirSync(profileDir, { recursive: true })

  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${PROFILE}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...bundles] } },
  }, null, 2)}\n`)

  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')

  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    '',
    'nodeLinker: hoisted',
    'autoInstallPeers: false',
    '',
    'allowBuilds:',
    '  node-pty: true',
    '  protobufjs: true',
    '',
    'minimumReleaseAgeExclude:',
    '  - \'@deepseek-ai/*\'',
    '  - \'dsh-tauri*\'',
    '',
  ].join('\n'))
}

/** 自建目录链接：把仓库里的插件包接到 profile 的 node_modules 下。 */
function linkPackage(profileDir: string, pkg: string): void {
  const source = join(REPO_ROOT, 'packages', pkg)
  if (!existsSync(source))
    throw new Error(`未找到插件包目录：${source}`)

  const target = join(profileDir, 'node_modules', pkg)
  mkdirSync(dirname(target), { recursive: true })
  rmSync(target, { recursive: true, force: true })

  // junction 对目录链接不需要管理员权限，且在 Windows 上表现稳定。
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

/** 读取 bundle 列表 */
function readBundles(profileDir: string): string[] {
  return readJson<ProfileManifest>(join(profileDir, 'package.json'))?.dsh?.profile?.bundles ?? []
}

function addBundle(profileDir: string, pkg: string): void {
  const path = join(profileDir, 'package.json')
  updateJson<ProfileManifest>(path, (manifest) => {
    const dependencies = manifest.dependencies ?? {}
    dependencies[pkg] = `link:${join(REPO_ROOT, 'packages', pkg)}`

    const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
    bundles.add(pkg)

    return {
      ...manifest,
      dependencies,
      dsh: {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles: [...bundles],
        },
      },
    }
  })
}

/**
 * 挂载自检：`packages` 必须全部登记进 profile 的 `dsh.profile.bundles`，否则启动前即失败。
 *
 * 独立导出是因为该分支在 link 模式下不可达——bundles 由 `addBundle` 自己写入，端到端
 * 构造不出「挂载漏登记」；只有直接给一份 profile 才能覆盖这一失败形态。
 */
export function assertMountRegistered(profileDir: string, packages: readonly string[]): void {
  const registered = readBundles(profileDir)
  const missing = packages.filter(pkg => !registered.includes(pkg))
  if (missing.length > 0)
    throw new Error(`挂载未注册到 dsh.profile.bundles：${missing.join(', ')}`)
}

/* ==========================================
 * 进程与 CLI 交互
 * ========================================== */

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''

    child.stdout?.on('data', chunk => output += chunk.toString())
    child.stderr?.on('data', chunk => output += chunk.toString())
    child.on('error', reject)

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const tail = output.split('\n').slice(-20).join('\n')
      reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}：\n${tail}`))
    })
  })
}

async function mountViaCli(profileDir: string, home: string, pkgs: readonly string[]): Promise<void> {
  const [dshBin] = resolveDshCommand()
  const storeDir = process.env.DSH_E2E_PNPM_STORE_DIR
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: home,
    ...(storeDir
      ? { npm_config_store_dir: storeDir, pnpm_config_store_dir: storeDir }
      : {}),
  }

  for (const pkg of pkgs) {
    const linkArg = `link:${join(REPO_ROOT, 'packages', pkg)}`
    await run(resolveNodeBin(), [dshBin, 'plugin', '--profile', PROFILE, 'add', linkArg], profileDir, env)
  }
}

async function killTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null)
    return

  const pid = child.pid
  if (process.platform === 'win32') {
    await new Promise<void>((resolvePromise) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      killer.on('close', resolvePromise)
      killer.on('error', resolvePromise)
    })
    return
  }

  child.kill('SIGTERM')
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1_500))
  if (child.exitCode === null)
    child.kill('SIGKILL')
}

async function waitForReady(child: ChildProcess, logPath: string): Promise<string> {
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`dsh web 提前退出（code ${child.exitCode}）；日志：${logPath}\n${tailOf(logPath)}`)

    const match = READY_RE.exec(readLog(logPath))
    if (match !== null)
      return match[0]

    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }

  throw new Error(`等待 dsh web 就绪超时（${READY_TIMEOUT_MS}ms）；日志：${logPath}\n${tailOf(logPath)}`)
}

/** 用就绪 URL 的一次性 token 换浏览器会话 Cookie */
async function exchangeLaunchToken(url: string): Promise<string> {
  const launch = new URL(url)
  if (!launch.searchParams.has('token'))
    return ''

  const response = await fetch(launch.href, { redirect: 'manual' })

  // 兼容 Node.js fetch API 的 getSetCookie 提案
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
  const setCookies = getSetCookie?.call(response.headers) ?? []
  const first = setCookies[0] ?? response.headers.get('set-cookie')

  if (response.status !== 303 || !first) {
    throw new Error(
      `token 交换未返回 303 + Set-Cookie（实际 ${response.status}）；`
      + '该宿主可能不支持根路径 token 交换（该通道只在 `GET /?token=` 上生效）',
    )
  }

  return first.split(';', 1)[0].trim()
}

/* ==========================================
 * 主入口导出 (Main Export)
 * ========================================== */

/**
 * 起一个真实 dsh web 宿主并挂载指定插件。
 * 调用方负责 `stop()`（Playwright 用 globalSetup/globalTeardown 保证）。
 */
export async function startDshHost(options: StartDshHostOptions): Promise<DshHost> {
  const { plugin, also = [], keepHome = false } = options
  const packages = [...also, plugin]

  for (const pkg of packages)
    assertBuilt(join(REPO_ROOT, 'packages', pkg), pkg)

  const home = join(tmpdir(), `dsh-e2e-${plugin}-${Date.now().toString(36)}`)
  const profileDir = join(home, 'profiles', PROFILE)
  const logPath = join(home, 'dsh-web.log')
  const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...packages]

  try {
    writeProfile(profileDir, bundles)

    const mode = process.env.DSH_E2E_MOUNT ?? 'link'
    if (mode === 'cli') {
      log(`挂载方式：cli（dsh plugin add）；profile=${profileDir}`)
      await mountViaCli(profileDir, home, packages)
    }
    else {
      log(`挂载方式：link；profile=${profileDir}`)
      for (const pkg of packages) {
        linkPackage(profileDir, pkg)
        addBundle(profileDir, pkg)
      }
    }

    assertMountRegistered(profileDir, packages)
  }
  catch (error) {
    rmSync(home, { recursive: true, force: true })
    throw error
  }

  const [dshBin] = resolveDshCommand()
  const args = [dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open']
  log(`启动 dsh web（DSH_HOME=${home}）`)

  // **优化点**：改用 WriteStream 追加写日志，避免大规模内存拼接以及全量文件 I/O 阻塞
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn(resolveNodeBin(), args, {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout?.pipe(logStream, { end: false })
  child.stderr?.pipe(logStream, { end: false })

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped)
      return
    stopped = true

    // 顺序要紧：子进程的 stdout/stderr 仍以 `end: false` 管道接着日志流，
    // 先 end() 会把子进程退出前的输出写进已结束的流；日志文件又落在 home 里，
    // 流没真正关闭就删目录，在 Windows 上会 EBUSY/EPERM。
    await killTree(child)
    child.stdout?.unpipe(logStream)
    child.stderr?.unpipe(logStream)
    logStream.end()
    await finished(logStream).catch(() => {})

    if (!keepHome)
      rmSync(home, { recursive: true, force: true })
    else
      log(`KEEP_HOME：保留 ${home}`)
  }

  try {
    const url = await waitForReady(child, logPath)
    const baseUrl = new URL(url).origin
    const cookie = await exchangeLaunchToken(url)
    const version = packageVersion(join(REPO_ROOT, 'packages', plugin))

    log(`就绪：${baseUrl}（已挂载 ${packages.join(', ')}；${plugin}@${version}；会话 Cookie ${cookie === '' ? '不适用' : '已获取'}）`)

    return { url, baseUrl, cookie, home, logPath, mounted: packages, stop }
  }
  catch (error) {
    await stop()
    throw error
  }
}
