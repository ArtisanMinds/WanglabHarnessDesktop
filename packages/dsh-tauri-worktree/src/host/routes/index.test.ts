/**
 * host/routes/index.test.ts — 工作树路由声明的协议回归（迁移契约）。
 *
 * 覆盖：
 *   1. 路由表的 (kind, path) 与声明方法恰好是迁移前那 6 条 (方法, 路径)；
 *   2. 未声明方法 405 + allow 头、OPTIONS 预检 204（与迁移前一致）；
 *   3. 请求级校验的 400 领域错误（缺 sessionId，发生在任何落盘之前）；
 *   4. **apply 期依赖随注册传入处理器**：`routes(ctx, deps)` 的 deps 经
 *      `event.context.dshDeps` 到达处理器（`dshRouteDepsOf<WorktreeRouteDeps>(event)` 取回），
 *      并用唯一标记证明处理器读到的就是本次注册那一个对象；
 *   5. **同一路由声明挂载两次各读各的依赖**（模块级可变状态已清零的回归：
 *      两个注册各自的数据根 / 删除任务登记表互不串台）。
 *
 * 走真实 node:http 服务（h3 的 toNodeHandler 依赖真实 req/res 流），并在测试内复刻宿主
 * webserver 的 exact 匹配契约；连接鉴权 / 回环 / 跨源 / 请求体上限边界由 dsh-tauri 的
 * `defineRoutes` 统一承担（其自身已有覆盖），这里只锁本插件的路径、方法与依赖传递。
 */

import type { HostRoute, RoutesContext } from 'dsh-tauri'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { DiscardJob, DiscardJobs } from '../service/discard-jobs'
import type { Binding, WorktreeRouteDeps } from '../types'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '.'
import { resetTestDshHome } from '../../../../.test/test-utils'
import { WORKTREE_API_PREFIX as P } from '../../shared/constants'
import { worktreePath } from '../service/operation'
import { saveBinding } from '../storage'

vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})

const routeKey = (kind: string, path: string): string => `${kind}\u0000${path}`

/** 迁移后的路由表：6 条 (方法, 路径) 声明，逐条与迁移前的契约一一对应。 */
const EXPECTED_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['POST', P],
  ['DELETE', P],
  ['GET', `${P}/bindings`],
  ['GET', `${P}/status`],
  ['POST', `${P}/attach`],
  ['POST', `${P}/checkout`],
]

const EXPECTED_PATHS: readonly string[] = [...new Set(EXPECTED_ROUTES.map(([, path]) => path))]

/** 每条路径的 allow 头（规范顺序：GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS；声明 GET 即隐含 HEAD）。 */
const ALLOW_BY_PATH: Readonly<Record<string, string>> = {
  [P]: 'POST, DELETE, OPTIONS',
  [`${P}/bindings`]: 'GET, HEAD, OPTIONS',
  [`${P}/status`]: 'GET, HEAD, OPTIONS',
  [`${P}/attach`]: 'POST, OPTIONS',
  [`${P}/checkout`]: 'POST, OPTIONS',
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
 * 删除任务登记表替身：不跑真实删除，只用带 `tag` 的返回值证明「处理器读到的正是本次注册
 * 传入的那一个对象」。`unsettled` / `start` / `lookup` 的返回都带该标记。
 */
function createJobsStub(tag: string): DiscardJobs {
  return {
    unsettled: () => [{ jobId: `unsettled-${tag}`, sessionId: 'session-a', worktreeKey: 'hash-a/repo', state: 'failed', error: 'boom' }],
    lookup: (sessionId, jobId) => (jobId
      ? { jobId, sessionId, worktreeKey: 'hash-a/repo', state: 'deleting' }
      : undefined),
    reuse: () => undefined,
    start: (sessionId, worktreeHashDirname, worktreePath) => ({
      jobId: `started-${tag}`,
      sessionId,
      worktreeKey: worktreeHashDirname,
      worktreePath,
      state: 'deleting',
    }),
  }
}

/** 组装本次注册的 apply 期依赖；每个字段都带 `tag` 标记，便于断言「读到的是这一个」。 */
function createDeps(tag: string): WorktreeRouteDeps {
  return {
    config: { linkDependencyDirectories: [`node_modules-${tag}`] },
    discardJobs: createJobsStub(tag),
  }
}

const servers: Server[] = []

beforeEach(() => {
  resetTestDshHome()
})

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
function sendJson(base: string, path: string, method: string, body: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
}

/** `routes(ctx, deps)` 注册全部路由并返回本次注册的卸载函数；deps 随注册传入，无需全局状态。 */
function mount(harness: Harness, deps: WorktreeRouteDeps): () => void {
  return routes(harness.ctx, deps)
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

describe('工作树路由声明', () => {
  it('声明 6 条 exact 路由，卸载后清空注册', () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps('table'))

    expect([...harness.registered.keys()].sort())
      .toEqual(EXPECTED_PATHS.map(path => routeKey('exact', path)).sort())
    expect(EXPECTED_ROUTES).toHaveLength(6)
    expect(harness.registered.size).toBe(EXPECTED_PATHS.length)

    dispose()
    expect(harness.registered.size).toBe(0)
  })

  it('未声明的方法返回 405 + allow 头（每条路径与迁移前一致）', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps('405'))
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
    const dispose = mount(harness, createDeps('options'))
    const base = await listen(harness.registered)

    const collection = await fetch(`${base}${P}`, { method: 'OPTIONS' })
    expect(collection.status).toBe(204)
    expect(collection.headers.get('allow')).toBe('POST, DELETE, OPTIONS')

    const status = await fetch(`${base}${P}/status`, { method: 'OPTIONS' })
    expect(status.status).toBe(204)
    expect(status.headers.get('allow')).toBe('GET, HEAD, OPTIONS')

    dispose()
  })

  it('缺 sessionId 的写路由返回 400（在任何落盘之前）', async () => {
    const harness = createHarness()
    const dispose = mount(harness, createDeps('400'))
    const base = await listen(harness.registered)

    for (const path of [P, `${P}/attach`]) {
      const response = await sendJson(base, path, 'POST', '{}')
      expect(response.status, path).toBe(400)
      expect(await response.json(), path).toEqual({ error: '缺少 sessionId' })
    }

    dispose()
  })

  it('deps 随 routes(ctx, deps) 到达处理器：三个处理器各读回本次注册那一个对象', async () => {
    const harness = createHarness()
    const deps = createDeps('identity')
    const dispose = mount(harness, deps)
    const base = await listen(harness.registered)

    // GET /bindings 读全局 ledger（空目录 → 无绑定）与本次注册的 deps.discardJobs.unsettled()。
    const bindings = await fetch(`${base}${P}/bindings`)
    expect(bindings.status).toBe(200)
    expect(await bindings.json()).toEqual({
      bindings: [],
      jobs: [{
        sessionId: 'session-a',
        jobId: 'unsettled-identity',
        state: 'failed',
        error: 'boom',
        worktreeKey: 'hash-a/repo',
        worktreePath: undefined,
      }],
    })

    // GET /status 读 deps.discardJobs.lookup()：deleting 任务直接收敛，不落到绑定账本。
    const status = await fetch(`${base}${P}/status?sessionId=session-a&jobId=job-1`)
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({
      mode: 'deleting',
      jobId: 'job-1',
      worktreeKey: 'hash-a/repo',
      worktreePath: undefined,
      error: undefined,
    })

    // DELETE 集合根读 deps.discardJobs.start()（reuse 返回 undefined → 新建任务）。
    // 先把确定性工作树目录建出来：否则「无绑定 + 路径已消失」会命中幂等短路（直接返回
    // { ok: true } 而不造任务），就验证不到 start() 收到的依赖了。
    mkdirSync(worktreePath('hash-a', 'repo'), { recursive: true })
    const discarded = await sendJson(base, P, 'DELETE', JSON.stringify({ sessionId: 'session-a', worktreeHashDirname: 'hash-a/repo' }))
    expect(discarded.status).toBe(200)
    expect(await discarded.json()).toEqual({ ok: true, jobId: 'started-identity' })

    dispose()
  })

  it('同一路由声明挂载两次各读各的 apply 期依赖（无模块级串台）', async () => {
    // binding ledger 是全局的（固定落 DSH_HOME），两次注册读同一份绑定；随注册传入的
    // deps.discardJobs 则必须各读各的：若依赖还落在模块级全局，后注册的 B 会覆盖 A。
    const binding: Binding = {
      sessionId: 'session-a',
      sourceSessionId: 'source-a',
      hash: 'hash-a',
      dirname: 'repo',
      worktreePath: worktreePath('hash-a', 'repo'),
      projectPath: '/tmp/repo',
      branchName: 'dsh/x',
      ownsBranch: true,
      createdAt: new Date().toISOString(),
      log: [],
    }
    mkdirSync(binding.worktreePath, { recursive: true })
    await saveBinding('session-a', binding)

    const harnessA = createHarness()
    const harnessB = createHarness()
    const disposeA = mount(harnessA, createDeps('a'))
    const disposeB = mount(harnessB, createDeps('b'))
    const baseA = await listen(harnessA.registered)
    const baseB = await listen(harnessB.registered)

    const fromA = await (await fetch(`${baseA}${P}/bindings`)).json() as { bindings: Binding[], jobs: DiscardJob[] }
    expect(fromA.bindings.map(item => item.sessionId)).toEqual(['session-a'])
    expect(fromA.jobs.map(job => job.jobId)).toEqual(['unsettled-a'])

    const fromB = await (await fetch(`${baseB}${P}/bindings`)).json() as { bindings: Binding[], jobs: DiscardJob[] }
    expect(fromB.bindings.map(item => item.sessionId)).toEqual(['session-a'])
    expect(fromB.jobs.map(job => job.jobId)).toEqual(['unsettled-b'])

    disposeA()
    disposeB()
  })
})
