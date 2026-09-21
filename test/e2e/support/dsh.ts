import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** 仓库根目录（本文件位于 `<root>/test/e2e/support/`）。 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** scratch profile 名：与桌面端一致（`dsh web` 默认档案）。 */
const PROFILE = 'web'

/**
 * 就绪行正则：只取 URL 本体（`dsh web: ` 前缀留在匹配之外，否则 `new URL()` 会抛错）。
 * 必须匹配至空白处止——在 `/` 处截断会丢失 `?token=`，导致首屏 401。
 */
const READY_RE = /http:\/\/127\.0\.0\.1:\d\S*/

/** 就绪等待上限（冷启 dsh web + 插件装配）。 */
const READY_TIMEOUT_MS = 120_000

/** 预定义 app-data 相对路径节点 */
const APPDATA_BASE = process.env.APPDATA ?? ''
const DSH_BIN_REL_PATH = join('dependencies', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

/** 桌面端已装配的 dsh 入口（无 PATH 上的 dsh 时的兜底）。 */
const ASSEMBLED_DSH = join(APPDATA_BASE, 'dsh-tauri', DSH_BIN_REL_PATH)

/** 标识符改名前的 Legacy 装配目录（兼容旧机器）。 */
const LEGACY_ASSEMBLED_DSH = join(APPDATA_BASE, 'io.github.hairyf.deepseek-harness-desktop', DSH_BIN_REL_PATH)

/* ==========================================
 * 类型定义 (Type Definitions)
 * ========================================== */

export interface StartDshHostOptions {
  /** 要挂载的包名，如 `dsh-tauri-pet`。 */
  plugin: string
  /** 额外挂载的包名（依赖插件，如 `dsh-tauri`）。 */
  also?: readonly string[]
  /** 保留 scratch 目录（调试用）。 */
  keepHome?: boolean
}

/** 已就绪的 scratch profile（尚未启动 `dsh web`）。 */
export interface DshProfile {
  /** 本次调用独占的 DSH_HOME。 */
  readonly home: string
  /** profile 目录（`<home>/profiles/web`）。 */
  readonly profileDir: string
  /** 已挂载的包名（含 also）。 */
  readonly packages: readonly string[]
}

export interface DshHost {
  /** 带一次性 token 的就绪 URL；`baseUrl` 用于 HTTP 断言。 */
  readonly url: string
  /** 裸 origin（`http://127.0.0.1:<port>`）。 */
  readonly baseUrl: string
  /** 用就绪 URL 的一次性 token 换来的浏览器会话 Cookie（`name=value`）。 */
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

interface ProfileManifest {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

interface PkgManifest {
  version?: string
  main?: string
  exports?: Record<string, unknown>
}

/* ==========================================
 * 通用/基础工具函数 (Utils)
 * ========================================== */

function log(message: string): void {
  process.stderr.write(`[dsh] ${message}\n`)
}

/** node 入口：显式环境变量优先，便于在 CI 里固定解释器。 */
export function resolveNodeBin(): string {
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

/** 获取日志尾部文本（用于出错断言输出） */
function tailOf(path: string, lines = 30): string {
  try {
    const text = readFileSync(path, 'utf8')
    if (!text)
      return '(日志为空)'
    return text.split('\n').slice(-lines).join('\n')
  }
  catch {
    return '(无法读取日志)'
  }
}

/* ==========================================
 * 业务逻辑与依赖解析
 * ========================================== */

/**
 * 解析 dsh 入口：显式环境变量 → 依赖树里的 `@deepseek-ai/dsh/lib/bin.js` → 桌面端装配目录
 */
export function resolveDshCommand(): string[] {
  const explicit = process.env.DSH_E2E_DSH_BIN
  if (explicit)
    return [explicit]

  try {
    return [require.resolve('@deepseek-ai/dsh/lib/bin.js')]
  }
  catch {
    // 仓库未直接依赖 dsh CLI 时忽略
  }

  if (existsSync(ASSEMBLED_DSH))
    return [ASSEMBLED_DSH]
  if (existsSync(LEGACY_ASSEMBLED_DSH))
    return [LEGACY_ASSEMBLED_DSH]

  throw new Error(
    'DSH_E2E_DSH_BIN 未设置，PATH 与桌面端装配目录都没有 dsh 入口；'
    + '请设置 DSH_E2E_DSH_BIN 指向 @deepseek-ai/dsh 的 lib/bin.js',
  )
}

/** 从 dsh 入口反推核心版本；读不到返回 `unknown`（仅用于日志）。 */
function coreVersion(dshBin: string): string {
  const manifestPath = join(dirname(dirname(dshBin)), 'package.json')
  return readJson<PkgManifest>(manifestPath)?.version ?? 'unknown'
}

/** 校验插件已构建 */
function assertBuilt(pkgDir: string, pkg: string): void {
  const manifest = readJson<PkgManifest>(join(pkgDir, 'package.json')) ?? {}
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

  const profilePkg = {
    name: `dsh-profile-${PROFILE}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...bundles] } },
  }

  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(profilePkg, null, 2)}\n`)
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')

  const workspaceYml = [
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
  ].join('\n')

  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), workspaceYml)
}

/** 自建目录链接：把仓库里的插件包接到 profile 的 node_modules 下。 */
function linkPackage(profileDir: string, pkg: string): void {
  const source = join(REPO_ROOT, 'packages', pkg)
  if (!existsSync(source)) {
    throw new Error(`未找到插件包目录：${source}`)
  }

  const target = join(profileDir, 'node_modules', pkg)
  mkdirSync(dirname(target), { recursive: true })
  rmSync(target, { recursive: true, force: true })

  // junction 对目录链接不需要管理员权限，在 Windows 上表现更稳健
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

/** 读取 bundle 列表 */
function readBundles(profileDir: string): string[] {
  return readJson<ProfileManifest>(join(profileDir, 'package.json'))?.dsh?.profile?.bundles ?? []
}

function addBundle(profileDir: string, pkg: string): void {
  const manifestPath = join(profileDir, 'package.json')
  updateJson<ProfileManifest>(manifestPath, (manifest) => {
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
          bundles: Array.from(bundles),
        },
      },
    }
  })
}

/**
 * 挂载自检：`packages` 必须全部登记进 profile 的 `dsh.profile.bundles`
 */
export function assertMountRegistered(profileDir: string, packages: readonly string[]): void {
  const registered = readBundles(profileDir)
  const missing = packages.filter(pkg => !registered.includes(pkg))
  if (missing.length > 0) {
    throw new Error(`挂载未注册到 dsh.profile.bundles：${missing.join(', ')}`)
  }
}

/* ==========================================
 * 进程与 CLI 交互
 * ========================================== */

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''

    child.stdout?.on('data', chunk => (output += chunk.toString()))
    child.stderr?.on('data', chunk => (output += chunk.toString()))
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
    ...(storeDir ? { npm_config_store_dir: storeDir, pnpm_config_store_dir: storeDir } : {}),
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
  await new Promise(resolve => setTimeout(resolve, 1_500))
  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

/**
 * 实时从进程流解析 Ready 状态，避免频繁全量读磁盘 logPath
 */
async function waitForReadyStream(child: ChildProcess, logPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let timer: NodeJS.Timeout

    const cleanup = () => {
      clearTimeout(timer)
      child.off('exit', onExit)
    }

    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`dsh web 提前退出（code ${code}）；日志：${logPath}\n${tailOf(logPath)}`))
    }

    timer = setTimeout(() => {
      cleanup()
      reject(new Error(`等待 dsh web 就绪超时（${READY_TIMEOUT_MS}ms）；日志：${logPath}\n${tailOf(logPath)}`))
    }, READY_TIMEOUT_MS)

    child.on('exit', onExit)

    const checkLine = (line: string) => {
      const match = READY_RE.exec(line)
      if (match) {
        cleanup()
        resolve(match[0])
      }
    }

    if (child.stdout) {
      const rlOut = createInterface({ input: child.stdout })
      rlOut.on('line', checkLine)
    }

    if (child.stderr) {
      const rlErr = createInterface({ input: child.stderr })
      rlErr.on('line', checkLine)
    }
  })
}

/** 用就绪 URL 的一次性 token 换浏览器会话 Cookie */
async function exchangeLaunchToken(url: string): Promise<string> {
  const launch = new URL(url)
  if (!launch.searchParams.has('token'))
    return ''

  const response = await fetch(launch.href, { redirect: 'manual' })

  // 兼容 Node.js fetch API 的 getSetCookie 规范
  const getSetCookieFn = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
  const setCookies = getSetCookieFn?.call(response.headers) ?? []
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
 * 只完成 scratch profile 的创建与挂载，不启动 `dsh web`。
 */
export async function scaffoldDshProfile(options: StartDshHostOptions): Promise<DshProfile> {
  const { plugin, also = [] } = options
  const packages = [...also, plugin]

  for (const pkg of packages) {
    assertBuilt(join(REPO_ROOT, 'packages', pkg), pkg)
  }

  const home = join(tmpdir(), `dsh-e2e-${plugin}-${Date.now().toString(36)}`)
  const profileDir = join(home, 'profiles', PROFILE)
  const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...packages]

  try {
    writeProfile(profileDir, bundles)

    if ((process.env.DSH_E2E_MOUNT ?? 'link') === 'cli') {
      await mountViaCli(profileDir, home, packages)
    }
    else {
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

  return { home, profileDir, packages }
}

/**
 * 起一个真实 dsh web 宿主并挂载指定插件。
 * 调用方负责 `stop()`（globalSetup/globalTeardown 保证）。
 */
export async function startDshHost(options: StartDshHostOptions): Promise<DshHost> {
  const { keepHome = false } = options
  const { home, profileDir, packages } = await scaffoldDshProfile(options)
  const logPath = join(home, 'dsh-web.log')

  const [dshBin] = resolveDshCommand()
  const args = [dshBin, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open']

  const profile = basename(home)
  log(`🚀 挂载 DSH 核心 [${coreVersion(dshBin)}] (profile: ${profile})`)
  log(`└─ 路径: ${dshBin}`)

  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn(resolveNodeBin(), args, {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  // 同时将数据流写入日志文件
  child.stdout?.pipe(logStream, { end: false })
  child.stderr?.pipe(logStream, { end: false })

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped)
      return
    stopped = true

    await killTree(child)
    child.stdout?.unpipe(logStream)
    child.stderr?.unpipe(logStream)
    logStream.end()
    await finished(logStream).catch(() => {})

    if (!keepHome) {
      rmSync(home, { recursive: true, force: true })
    }
  }

  try {
    const url = await waitForReadyStream(child, logPath)
    const baseUrl = new URL(url).origin
    const cookie = await exchangeLaunchToken(url)

    log(`✅ 就绪 [${baseUrl}] → ${packages.join(', ')}${keepHome ? ' [keepHome]' : ''}`)

    return { url, baseUrl, cookie, home, logPath, mounted: packages, stop }
  }
  catch (error) {
    await stop()
    throw error
  }
}
