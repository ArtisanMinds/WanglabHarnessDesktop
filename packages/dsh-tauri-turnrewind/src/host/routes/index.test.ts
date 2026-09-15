/**
 * host/routes/index.test.ts — turnrewind 路由声明的协议回归。
 *
 * 覆盖（迁移契约）：路由表的 (kind, path) 与声明方法、未声明方法 405 + allow 头、
 * OPTIONS 预检 204、请求级校验的 400 领域错误，以及**注册期依赖的送达与隔离**——
 * `routes(ctx, deps)` 传入的 deps 必须原样到达处理器（经 `dshRouteDepsOf`），
 * 且两次注册各读各的（旧 `bindRouteDeps` 单例的串台回归）。
 *
 * 走真实 node:http 服务（h3 的 toNodeHandler 依赖真实 req/res 流），并在测试内复刻
 * 宿主 webserver 的 exact 匹配契约；连接鉴权 / 回环 / 跨源边界由 dsh-tauri 的
 * `defineRoutes` 统一承担（其自身已有覆盖），这里只锁本插件的路径、方法与响应形状。
 *
 * 只断言「不落盘」的路径：400 校验分支在任何账本/git 读写之前返回，因此测试不会触碰
 * 真实的 DSH 数据目录；依赖注入用替身 deps（`live` 读数面），不建捕获编排器。
 */

import type { HostRoute, RoutesContext } from 'dsh-tauri'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { LiveSnapshot, TurnrewindRouteDeps } from '../types'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from '.'
import { TURNREWIND_API_PREFIX as P } from '../../shared/constants'

const routeKey = (kind: string, path: string): string => `${kind}\u0000${path}`

const SUMMARY_PATH = `${P}/session/summary`
const LIVE_PATH = `${P}/session/live`
const UNDO_PATH = `${P}/session/undo`

/** 迁移后的路由表：3 条 (方法, 路径) 声明，逐条与迁移前的契约一一对应。 */
const EXPECTED_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['GET', SUMMARY_PATH],
  ['GET', LIVE_PATH],
  ['POST', UNDO_PATH],
]

const EXPECTED_PATHS: readonly string[] = [...new Set(EXPECTED_ROUTES.map(([, path]) => path))]

/** 每条路径的 allow 头（规范顺序：GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS；声明 GET 即隐含 HEAD）。 */
const ALLOW_BY_PATH: Readonly<Record<string, string>> = {
  [SUMMARY_PATH]: 'GET, HEAD, OPTIONS',
  [LIVE_PATH]: 'GET, HEAD, OPTIONS',
  [UNDO_PATH]: 'POST, OPTIONS',
}

/** 所有路径都未声明 PUT，用于统一验证 405 + allow。 */
const UNDECLARED_METHOD = 'PUT'

interface Harness {
  registered: Map<string, HostRoute>
  ctx: RoutesContext
}

/** 假宿主 ctx：注册表模拟宿主 webserver（重复 (kind,path) 抛错，disposer 删行）。 */
function createHarness(): Harness {
  const registered = new Map<string, HostRoute>()
  return {
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
    },
  }
}

/**
 * 路由依赖替身：`live` 读数面把本次注册的 `marker` 原样回显，`fileCount` 取 sessionId 长度。
 *
 * 处理器拿到的 deps 若是注册期传入的那一个，响应里的 `turn` 必然等于该次注册的 marker；
 * 两次注册用了不同 marker，因此这也顺带锁住「各读各的、不串台」。
 */
function createDeps(marker: number): TurnrewindRouteDeps {
  return {
    dshHome: `turnrewind-test-home-${marker}`,
    queue: { run: async (_key, task) => task(), size: () => 0 },
    live: (sessionId: string): LiveSnapshot => ({
      active: true,
      turn: marker,
      fileCount: sessionId.length,
      insertions: 0,
      deletions: 0,
    }),
  }
}

const servers: Server[] = []

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
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** 发一个 JSON 请求（body 为原始字符串，便于构造非法体）。 */
function postJson(base: string, path: string, body: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

/** `routes(ctx, deps)` 注册全部路由并返回本次注册的卸载函数；deps 随注册传入，无需全局状态。 */
function mount(harness: Harness, deps: TurnrewindRouteDeps): () => void {
  return routes(harness.ctx, deps)
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

describe('turnrewind 路由声明', () => {
  it('声明 3 条 exact 路由，卸载后清空注册', () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps(1))

    expect([...harness.registered.keys()].sort())
      .toEqual(EXPECTED_PATHS.map(path => routeKey('exact', path)).sort())
    expect(EXPECTED_ROUTES).toHaveLength(3)
    expect(harness.registered.size).toBe(3)

    dispose()
    expect(harness.registered.size).toBe(0)
  })

  it('未声明的方法返回 405 + allow 头（每条路径与迁移前一致）', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps(1))
    const base = await listen(harness.registered)

    for (const path of EXPECTED_PATHS) {
      const response = await fetch(`${base}${path}`, { method: UNDECLARED_METHOD })
      expect(response.status, path).toBe(405)
      expect(response.headers.get('allow'), path).toBe(ALLOW_BY_PATH[path])
    }

    dispose()
  })

  it('预检 OPTIONS 返回 204 并带 allow 头', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps(1))
    const base = await listen(harness.registered)

    const summary = await fetch(`${base}${SUMMARY_PATH}`, { method: 'OPTIONS' })
    expect(summary.status).toBe(204)
    expect(summary.headers.get('allow')).toBe('GET, HEAD, OPTIONS')

    const undo = await fetch(`${base}${UNDO_PATH}`, { method: 'OPTIONS' })
    expect(undo.status).toBe(204)
    expect(undo.headers.get('allow')).toBe('POST, OPTIONS')

    dispose()
  })

  it('缺 sessionId 的读路由与缺 body 的写路由返回 400（在任何落盘之前）', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps(1))
    const base = await listen(harness.registered)

    const summary = await fetch(`${base}${SUMMARY_PATH}`)
    expect(summary.status).toBe(400)
    expect(await summary.json()).toEqual({ error: '缺少 sessionId' })

    const live = await fetch(`${base}${LIVE_PATH}`)
    expect(live.status).toBe(400)
    expect(await live.json()).toEqual({ error: '缺少 sessionId' })

    const undo = await postJson(base, UNDO_PATH, '{}')
    expect(undo.status).toBe(400)
    expect(await undo.json()).toEqual({ error: '缺少 sessionId' })

    dispose()
  })

  it('注册期传入的 deps 原样送达处理器（live 读数面回显本次注册的实例）', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps(7))
    const base = await listen(harness.registered)

    const response = await fetch(`${base}${LIVE_PATH}?sessionId=abc`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      active: true,
      turn: 7,
      fileCount: 3,
      insertions: 0,
      deletions: 0,
    })

    dispose()
  })

  it('同一 routes 声明在两次不同 deps 的注册下各读各的（不串台）', async () => {
    const first = createHarness()
    const second = createHarness()
    const disposeFirst = mount(first, createDeps(11))
    const disposeSecond = mount(second, createDeps(22))
    const firstBase = await listen(first.registered)
    const secondBase = await listen(second.registered)

    const firstBody = await (await fetch(`${firstBase}${LIVE_PATH}?sessionId=ab`)).json()
    const secondBody = await (await fetch(`${secondBase}${LIVE_PATH}?sessionId=abcd`)).json()

    // 注册表各自独立，且各次注册的 deps 只影响自己的处理器。
    expect(firstBody).toMatchObject({ turn: 11, fileCount: 2 })
    expect(secondBody).toMatchObject({ turn: 22, fileCount: 4 })

    // 卸载其中一次不影响另一次。
    disposeFirst()
    expect(first.registered.size).toBe(0)
    expect(second.registered.size).toBe(3)
    expect(await (await fetch(`${secondBase}${LIVE_PATH}?sessionId=abcd`)).json()).toMatchObject({ turn: 22 })

    disposeSecond()
  })
})
