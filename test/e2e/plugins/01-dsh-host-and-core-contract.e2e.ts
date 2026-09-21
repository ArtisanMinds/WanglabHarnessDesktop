/**
 * 批次 01 · 编排骨架与共享路由契约（用例来源：`docs/testing/plugins/01-dsh-host-and-core-contract.md`）。
 *
 * 本批是全套插件用例的地基，两段各有不可替代的作用：
 * - 编排骨架不成立时，后面所有「插件路由 404」都无法区分是插件没挂上还是宿主没起来；
 * - 共享路由契约跑偏时，所有插件的负向断言都会失真。
 *
 * 断言对象一律是外部世界（HTTP 响应字节、profile 文件、临时目录），不采信插件自报。
 * 唯一例外是「挂载未登记」：link 模式下 bundles 由编排自己写入，端到端构造不出该失败形态，
 * 故直接调用导出的校验分支。
 */

import type { DshHost } from '../support/dsh-host'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertMountRegistered, REPO_ROOT, startDshHost } from '../support/dsh-host'

/** 源码即产物的包：无 `main`、无 `dist`，且被 `build:plugins` 显式排除，永远处于「未构建」。 */
const UNBUILT_PACKAGE = 'dsh-tauri-tsdown'

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

function readProfileManifest(home: string): ProfileManifest {
  return JSON.parse(readFileSync(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as ProfileManifest
}

/** `link:` 规格与仓库包路径对齐（CLI 会写成正斜杠，故统一 resolve 后比较）。 */
function linkedPath(spec: string): string {
  return resolve(spec.replace(/^link:/, ''))
}

describe('编排骨架', () => {
  it('验证在隔离 scratch 目录下能挂载目标插件并拉起真实 dsh web', async () => {
    const host = await startDshHost({ plugin: 'dsh-tauri' })
    try {
      expect(host.baseUrl, 'baseUrl 必须是回环地址 + 具体端口').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
      expect(new URL(host.baseUrl).port, '端口 0 表示没有真正绑定').not.toBe('0')
      expect(host.cookie, '会话 Cookie 必须换到').not.toBe('')
      expect(host.mounted, 'mounted 必须精确包含目标包').toContain('dsh-tauri')
      expect(host.home, 'scratch 目录必须按 <tmp>/dsh-e2e-<plugin>-<时间戳> 隔离').toContain('dsh-e2e-dsh-tauri-')

      const response = await fetch(`${host.baseUrl}/`, { headers: { cookie: host.cookie } })
      expect(response.status, '根路径带 Cookie 必须可访问').toBeGreaterThanOrEqual(200)
      expect(response.status).toBeLessThan(300)
      expect((await response.text()).length, '响应体不能为空').toBeGreaterThan(0)

      const log = readFileSync(host.logPath, 'utf8')
      expect(log, '日志内必须出现与 url 一致的就绪行').toContain(host.url)
      expect(log, '就绪的宿主不应有模块解析失败').not.toContain('ERR_MODULE_NOT_FOUND')
    }
    finally {
      await host.stop()
    }
    expect(existsSync(host.home), 'stop() 后 scratch 目录必须被清理').toBe(false)
  })

  it('验证宿主启动后目标插件的 bundle 已登记进 profile', async () => {
    const host = await startDshHost({ plugin: 'dsh-tauri', also: ['dsh-tauri-pet'] })
    try {
      const manifest = readProfileManifest(host.home)
      const bundles = manifest.dsh?.profile?.bundles ?? []

      expect(bundles).toContain('dsh-tauri-pet')
      expect(bundles).toContain('dsh-tauri')
      expect(new Set(bundles).size, 'bundles 不允许重复项').toBe(bundles.length)

      for (const name of ['dsh-tauri', 'dsh-tauri-pet']) {
        const spec = manifest.dependencies?.[name] ?? ''
        expect(spec, `${name} 必须由编排写成 link: 规格`).toMatch(/^link:/)
        expect(linkedPath(spec), `${name} 必须指向仓库 packages/${name}`).toBe(join(REPO_ROOT, 'packages', name))
      }

      // 规格写得对不等于挂得上：profile 里的链接必须真的落在仓库包目录上。
      const profileDir = join(host.home, 'profiles', 'web')
      for (const name of ['dsh-tauri', 'dsh-tauri-pet']) {
        expect(
          realpathSync(join(profileDir, 'node_modules', name)),
          `${name} 的挂载链接必须解引用到仓库包`,
        ).toBe(realpathSync(join(REPO_ROOT, 'packages', name)))
      }
    }
    finally {
      await host.stop()
    }
  })

  it('[反向] 验证挂载未登记进 bundles 时立刻失败，而不是带着半成品起服务', async () => {
    const profileDir = join(tmpdir(), `dsh-e2e-mount-guard-${Date.now().toString(36)}`)
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(
      join(profileDir, 'package.json'),
      `${JSON.stringify({ name: 'dsh-profile-web', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-tauri-pet'] } } }, null, 2)}\n`,
    )

    try {
      expect(
        () => assertMountRegistered(profileDir, ['dsh-tauri-pet']),
        '已登记的包不得误报',
      ).not.toThrow()
      expect(
        () => assertMountRegistered(profileDir, ['dsh-tauri-pet', 'dsh-tauri']),
        '缺失的包名必须列出，且只列缺失的那个',
      ).toThrowError(/^挂载未注册到 dsh\.profile\.bundles：dsh-tauri$/)
    }
    finally {
      rmSync(profileDir, { recursive: true, force: true })
    }
    expect(existsSync(profileDir), '夹具目录必须清理干净').toBe(false)
  })

  it('[反向] 验证产物缺失时报出可操作的构建指引', async () => {
    const before = new Set(readdirSync(tmpdir()))

    await expect(startDshHost({ plugin: UNBUILT_PACKAGE })).rejects.toThrowError(/尚未构建[\s\S]*pnpm build:plugins/)

    const leaked = readdirSync(tmpdir())
      .filter(name => name.startsWith(`dsh-e2e-${UNBUILT_PACKAGE}-`) && !before.has(name))
    expect(leaked, '预检失败不得留下 scratch 目录，也不得进入 dsh web 启动阶段').toEqual([])
  })

  it('验证环境变量边界：DSH_E2E_KEEP_HOME 控制 scratch 去留', async () => {
    const disposable = await startDshHost({ plugin: 'dsh-tauri-pet' })
    await disposable.stop()
    expect(existsSync(disposable.home), '默认必须清理 scratch 目录').toBe(false)

    const kept = await startDshHost({ plugin: 'dsh-tauri-pet', keepHome: true })
    try {
      await kept.stop()
      expect(existsSync(kept.home), 'KEEP_HOME 必须保留 scratch 目录').toBe(true)
      expect(readFileSync(kept.logPath, 'utf8').length, '保留的日志必须可读').toBeGreaterThan(0)
    }
    finally {
      rmSync(kept.home, { recursive: true, force: true })
    }
    expect(existsSync(kept.home), '手工删除后不得有残留锁文件').toBe(false)
  })

  it('验证 DSH_E2E_MOUNT=cli 走真实 CLI 挂载路径', async () => {
    process.env.DSH_E2E_MOUNT = 'cli'
    try {
      const host = await startDshHost({ plugin: 'dsh-tauri' })
      try {
        const spec = readProfileManifest(host.home).dependencies?.['dsh-tauri'] ?? ''
        expect(spec, 'dsh plugin add 必须把依赖写成 link: 规格').toMatch(/^link:/)
        expect(linkedPath(spec), 'CLI 写入的规格必须指向仓库包而非自建链接').toBe(join(REPO_ROOT, 'packages', 'dsh-tauri'))

        const response = await fetch(`${host.baseUrl}/`, { headers: { cookie: host.cookie } })
        expect(response.status, 'cli 挂载后宿主必须可用').toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(300)
      }
      finally {
        await host.stop()
      }
    }
    finally {
      delete process.env.DSH_E2E_MOUNT
    }
  })
})

/** 只声明 GET 的代表路由（`packages/dsh-tauri-pet/src/host/routes/index.ts`）。 */
const GET_ONLY_PATH = '/api/desktop/dsh-tauri-pet/session/stream'

/** 只声明 POST 的代表路由（`packages/dsh-tauri-rightclick/src/host/routes/index.ts`）。 */
const POST_ONLY_PATH = '/api/desktop/dsh-tauri-rightclick/open/url'

/** 本批不挂载的插件路径，用于证明「路由缺失」而非「鉴权失败」。 */
const UNMOUNTED_PATH = '/api/desktop/dsh-tauri-turnrewind/summary?sessionId=x'

const BODY_LIMIT_BYTES = 1024 * 1024

describe('共享路由契约', () => {
  let host: DshHost

  // 本段自带宿主而非复用 globalSetup：它需要「GET 代表路由 + POST 代表路由」这一特定挂载集，
  // 与默认 lane 的 `dsh-tauri-pet` 不同，自带宿主才能保证本文件独立可运行。
  beforeAll(async () => {
    host = await startDshHost({ plugin: 'dsh-tauri-pet', also: ['dsh-tauri-rightclick'] })
  })

  afterAll(async () => {
    await host.stop()
  })

  /** 所有请求都必须带会话 Cookie，否则 `/api` 一律 401，会把鉴权失败误读成路由契约失败。 */
  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return { cookie: host.cookie, ...extra }
  }

  function url(path: string): string {
    return `${host.baseUrl}${path}`
  }

  /** `allow` 成员顺序属实现细节，按集合比较。 */
  function allowMethods(response: Response): string[] {
    return (response.headers.get('allow') ?? '').split(',').map(entry => entry.trim()).filter(Boolean).sort()
  }

  it('验证 OPTIONS 预检在只声明 GET 的路径上返回 204 并公布 allow', async () => {
    const response = await fetch(url(GET_ONLY_PATH), { method: 'OPTIONS', headers: headers() })

    expect(response.status, '未声明的 OPTIONS 必须走默认 204 预检').toBe(204)
    expect(await response.text(), '预检响应不得带 body').toBe('')
    expect(allowMethods(response), 'allow 必须公布 GET / HEAD（GET 隐含）/ OPTIONS').toEqual(['GET', 'HEAD', 'OPTIONS'])
  })

  it('验证只声明 GET 的路径接受 HEAD 而不被判 405', async () => {
    const controller = new AbortController()
    try {
      const response = await fetch(url(GET_ONLY_PATH), {
        method: 'HEAD',
        headers: headers(),
        signal: controller.signal,
      })
      expect(response.status, 'GET 隐含 HEAD，不能落到 405').not.toBe(405)
      expect(response.status, 'HEAD 必须命中真实 handler').toBe(200)
    }
    finally {
      controller.abort()
    }
  })

  it('[反向] 验证未声明的方法返回 405 且给出可用的 allow', async () => {
    const response = await fetch(url(GET_ONLY_PATH), {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: '{}',
    })

    expect(response.status, '只声明了 GET，POST 必须 405').toBe(405)
    expect(response.headers.get('allow') ?? '', 'allow 必须指出可用方法').toContain('GET')

    const body = await response.json() as { error?: string }
    expect(body.error ?? '', '错误文本必须点明允许的方法').toMatch(/^仅支持 /)
    expect(body.error ?? '').toContain('GET')
  })

  it('[反向] 验证异源 Origin 的变更请求被 403 拒绝', async () => {
    const response = await fetch(url(POST_ONLY_PATH), {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json', 'origin': 'http://evil.example' }),
      body: '{}',
    })

    expect(response.status, '异源变更请求必须 403').toBe(403)

    const body = await response.json() as { error?: string }
    // 上游 Host/Origin 围栏（`dsh-client-connection` 的 `requestRejection`）先于路由层生效，
    // 用的是连接门词汇 `forbidden`；路由层的 `cross-origin-request` 分支在 L2 不可达，
    // 由 `packages/dsh-tauri/src/host/routes/index.test.ts` 的 L1 用例覆盖。
    expect(body.error, '拒绝必须来自连接门，而不是路由层').toBe('forbidden')
    expect(JSON.stringify(body), 'handler 的 {"ok":true} 不得出现').not.toContain('ok')
  })

  it('[反向] 验证超过 1 MiB 的请求体被 413 终止', async () => {
    const payload = JSON.stringify({ pad: 'x'.repeat(BODY_LIMIT_BYTES) })
    expect(payload.length, '测试数据必须真的超过上限').toBeGreaterThan(BODY_LIMIT_BYTES)

    let response: Response
    try {
      response = await fetch(url(POST_ONLY_PATH), {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json' }),
        body: payload,
      })
    }
    catch (error) {
      throw new Error(`超限请求体必须以 413 结束，而不是连接层异常：${(error as Error).message}`)
    }

    expect(response.status, 'bodyLimit 必须在读体时以 413 结束').toBe(413)
    expect(await response.text(), '413 必须报出上限字节数').toContain(String(BODY_LIMIT_BYTES))
  })

  it('[反向] 验证未挂载插件的路径返回 404，用于区分「没挂载」与「没鉴权」', async () => {
    const response = await fetch(url(UNMOUNTED_PATH), { headers: headers() })

    expect(response.status, '带 Cookie 时未挂载必须 404，而不是 401').toBe(404)
    expect(response.status, '不能误落到 200').not.toBe(200)
  })
})
