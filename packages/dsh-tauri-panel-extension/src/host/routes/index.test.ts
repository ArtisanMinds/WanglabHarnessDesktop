/**
 * host/routes/index.test.ts — 能力管理器路由声明的协议回归。
 *
 * 覆盖（迁移契约）：19 条路由的 (kind, path) 与声明方法、方法不符时 405 + allow 头、
 * OPTIONS 预检 204、GET /skills 的行形状、GET /mcp 的载荷形状、POST 的 400 领域错误、
 * 非 JSON 体 400、重启路由对非同源 / 带转发痕迹请求的 403。
 *
 * 走真实 node:http 服务（h3 的 toNodeHandler 依赖真实 req/res 流），并在测试内复刻
 * 宿主 webserver 的 exact 匹配契约；连接鉴权 / 回环 / 跨源边界由 dsh-tauri 的
 * `defineRoutes` 统一承担（其自身已有覆盖），这里只锁本插件的路径、方法与响应形状。
 */

import type { HostRoute, RoutesContext } from 'dsh-tauri'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '.'
import { resetTestDshHome } from '../../../../.test/test-utils'
import { API_PREFIX as P } from '../../shared/constants'

vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})

const routeKey = (kind: string, path: string): string => `${kind}\u0000${path}`

/** 迁移前的路由表（路径 + 方法），防止声明漂移。 */
const EXPECTED_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['GET', `${P}/skills`],
  ['POST', `${P}/skills/refresh`],
  ['GET', `${P}/skill`],
  ['POST', `${P}/skill/save`],
  ['POST', `${P}/skill/delete`],
  ['POST', `${P}/skill/policy`],
  ['POST', `${P}/open`],
  ['GET', `${P}/mcp`],
  ['POST', `${P}/mcp/save`],
  ['POST', `${P}/mcp/toggle`],
  ['POST', `${P}/mcp/remove`],
  ['POST', `${P}/mcp/check`],
  ['POST', `${P}/mcp/copy`],
  ['GET', `${P}/import/scan`],
  ['POST', `${P}/import/apply`],
  ['GET', `${P}/roots`],
  ['POST', `${P}/roots/add`],
  ['POST', `${P}/roots/remove`],
  ['POST', `${P}/restart`],
]

/** 宿主 skills 服务面返回的一行（不带 resourceBase：可编辑性判定不依赖磁盘）。 */
const SKILL = {
  name: 'demo-skill',
  description: 'A demo skill',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'user-dsh',
  provider: 'filesystem',
}

interface Harness {
  ctx: unknown
  registered: Map<string, HostRoute>
  dir: string
}

/** 假宿主 ctx：注册表模拟宿主 webserver（重复 (kind,path) 抛错，disposer 删行）。 */
function createHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-panel-extension-'))
  const registered = new Map<string, HostRoute>()
  return {
    dir,
    registered,
    ctx: {
      webServer: {
        register(route: HostRoute): () => void {
          const key = routeKey(route.kind, route.path)
          if (registered.has(key))
            throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
          registered.set(key, route)
          return () => {
            registered.delete(key)
          }
        },
      },
      logger: { error: () => {} },
      // 业务面：插件 HostContext 的扩展点，defineRoutes 只把 ctx 原样透传给 handler。
      skills: {
        list: async () => [SKILL],
        get: async (name: string) => (name === SKILL.name
          ? { name, content: '# demo', path: join(dir, 'skills', name, 'SKILL.md') }
          : undefined),
      },
    },
  }
}

/** 按协议注册：`routes(ctx, deps)` 返回本次注册的卸载函数（deps 随注册传入，无需全局状态）。 */
function mount(harness: Harness): () => void {
  return routes(harness.ctx as RoutesContext, {
    profileDirPath: join(harness.dir, 'profiles', 'web'),
    remountProvider: async () => {},
  })
}

const servers: Server[] = []
const dirs: string[] = []

/** 复刻宿主 webserver 的 exact 匹配契约，起一个真实 HTTP 服务并返回 base URL。 */
async function listen(registered: Map<string, HostRoute>): Promise<string> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const route = registered.get(routeKey('exact', pathname))
    if (!route) {
      response.writeHead(404)
      response.end()
      return
    }
    Promise.resolve(route.handler(request, response)).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500)
        response.end()
      }
    })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** 起一个服务并挂上本次注册的路由。 */
async function start(): Promise<{ base: string, dispose: () => void }> {
  const harness = createHarness()
  dirs.push(harness.dir)
  const dispose = mount(harness)
  const base = await listen(harness.registered)
  return { base, dispose }
}

beforeEach(() => {
  resetTestDshHome()
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe('能力管理器路由声明', () => {
  it('按迁移前的路径与方法声明 19 条 exact 路由，卸载后清空注册', () => {
    const harness = createHarness()
    dirs.push(harness.dir)
    const dispose = mount(harness)

    expect([...harness.registered.keys()].sort())
      .toEqual(EXPECTED_ROUTES.map(([, path]) => routeKey('exact', path)).sort())
    expect(harness.registered.size).toBe(19)

    dispose()
    expect(harness.registered.size).toBe(0)
  })

  it('读路由拒绝变更方法，变更路由拒绝读方法（405 + allow 头）', async () => {
    const { base, dispose } = await start()

    const wrongMethodOnRead = await fetch(`${base}${P}/skills`, { method: 'POST' })
    expect(wrongMethodOnRead.status).toBe(405)
    expect(wrongMethodOnRead.headers.get('allow')).toBe('GET, HEAD, OPTIONS')

    const mutatePaths = EXPECTED_ROUTES.filter(([method]) => method === 'POST').map(([, path]) => path)
    expect(mutatePaths).toHaveLength(14)
    for (const path of mutatePaths) {
      const response = await fetch(`${base}${path}`)
      expect(response.status, path).toBe(405)
      expect(response.headers.get('allow'), path).toBe('POST, OPTIONS')
    }

    dispose()
  })

  it('oPTIONS 预检返回 204 并带 allow 头', async () => {
    const { base, dispose } = await start()

    const read = await fetch(`${base}${P}/mcp`, { method: 'OPTIONS' })
    expect(read.status).toBe(204)
    expect(read.headers.get('allow')).toBe('GET, HEAD, OPTIONS')

    const mutate = await fetch(`${base}${P}/mcp/save`, { method: 'OPTIONS' })
    expect(mutate.status).toBe(204)
    expect(mutate.headers.get('allow')).toBe('POST, OPTIONS')

    dispose()
  })

  it('gET /skills 返回宿主技能目录行（含编辑标志，不带 resourceBase 即不可编辑）', async () => {
    const { base, dispose } = await start()

    const response = await fetch(`${base}${P}/skills`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      skills: [{
        name: 'demo-skill',
        description: 'A demo skill',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'user-dsh',
        provider: 'filesystem',
        editable: false,
        removable: true,
        policyEditable: false,
      }],
    })

    dispose()
  })

  it('gET /skill 命中返回内容，未命中返回 404 领域错误', async () => {
    const { base, dispose } = await start()

    const found = await fetch(`${base}${P}/skill?name=demo-skill`)
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual({ name: 'demo-skill', content: '# demo' })

    const missing = await fetch(`${base}${P}/skill?name=nope`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'skill not found' })

    dispose()
  })

  it('gET /mcp 在空的 patch 层上返回空列表并带 restartNeeded', async () => {
    const { base, dispose } = await start()

    const response = await fetch(`${base}${P}/mcp`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ servers: [], restartNeeded: true })

    dispose()
  })

  it('pOST 变更路由对缺失字段返回 400 领域错误', async () => {
    const { base, dispose } = await start()

    const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
      [`${P}/mcp/toggle`, {}, 'id and disabled are required'],
      [`${P}/mcp/remove`, {}, 'id is required'],
      [`${P}/mcp/check`, {}, 'id is required'],
      [`${P}/mcp/copy`, {}, 'id is required'],
      [`${P}/roots/remove`, {}, 'id is required'],
      [`${P}/roots/add`, { kind: 'zip' }, 'kind must be local or git'],
      [`${P}/open`, {}, 'target is required'],
    ]
    for (const [path, body, error] of cases) {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(response.status, path).toBe(400)
      expect(await response.json(), path).toEqual({ error })
    }

    dispose()
  })

  it('非对象 / 非法 JSON / 非 JSON 编码体在变更路由上返回 400', async () => {
    const { base, dispose } = await start()

    const invalidJson = await fetch(`${base}${P}/mcp/toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect(invalidJson.status).toBe(400)

    // 请求体一律按 JSON 解析：urlencoded 体不会被当成合法对象放行。
    const urlencoded = await fetch(`${base}${P}/mcp/toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'id=x&disabled=true',
    })
    expect(urlencoded.status).toBe(400)

    dispose()
  })

  it('pOST /restart 拒绝无 Origin 或带转发痕迹的请求（403，不触达进程控制）', async () => {
    const { base, dispose } = await start()

    const noOrigin = await fetch(`${base}${P}/restart`, { method: 'POST' })
    expect(noOrigin.status).toBe(403)
    expect(await noOrigin.json()).toEqual({ error: 'untrusted origin' })

    const forwarded = await fetch(`${base}${P}/restart`, {
      method: 'POST',
      headers: { 'origin': base, 'x-forwarded-for': '127.0.0.1' },
    })
    expect(forwarded.status).toBe(403)
    expect(await forwarded.json()).toEqual({ error: 'untrusted origin' })

    dispose()
  })

  it('同一份声明两次注册下各读各的 deps（两次注册互不串台）', async () => {
    // 两次注册各带自己的 profileDirPath（数据根 DSH_HOME 是全局的，profile 目录不是）。
    // 迁移前的模块级单例绑定会被后一次注册覆盖，先注册的一方会读后一方的目录——本用例即该回归。
    const first = createHarness()
    const second = createHarness()
    dirs.push(first.dir, second.dir)
    const disposeFirst = mount(first)
    const disposeSecond = mount(second)
    mkdirSync(join(first.dir, 'profiles', 'web'), { recursive: true })
    mkdirSync(join(second.dir, 'profiles', 'web'), { recursive: true })
    const firstBase = await listen(first.registered)
    const secondBase = await listen(second.registered)

    const saved = await fetch(`${firstBase}${P}/mcp/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverName: 'only-first', transport: 'http', url: 'http://127.0.0.1:9/mcp' }),
    })
    expect(saved.status).toBe(200)

    const firstRows = await (await fetch(`${firstBase}${P}/mcp`)).json() as { servers: unknown[] }
    expect(firstRows.servers).toHaveLength(1)

    const secondRows = await (await fetch(`${secondBase}${P}/mcp`)).json() as { servers: unknown[] }
    expect(secondRows.servers).toEqual([])

    disposeFirst()
    disposeSecond()
  })
})
