/**
 * 批次 07 · 扩展管理面板的 L2 宿主路由（用例来源：`docs/testing/plugins/07-dsh-tauri-panel-extension.md`）。
 *
 * 本批只走 HTTP：断言对象是宿主返回的状态码与响应字节，以及 scratch profile 里配置文件的内容，
 * 不采信插件自报。写入分支（技能保存 / 导入 / 仓库创建）会改动用户配置，本批一概不碰。
 *
 * 宿主复用 globalSetup 那一个共享宿主——`also` 默认已挂载本插件，不再另起进程。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, inject, it } from 'vitest'

/** 与 `packages/dsh-tauri-panel-extension/src/shared/constants.ts` 的 PLUGIN_ID 对齐。 */
const ROUTE_PREFIX = '/api/desktop/dsh-tauri-panel-extension'

interface ErrorBody {
  error?: string
}

interface SkillsBody {
  skills?: SkillRow[]
  error?: string
}

interface SkillRow {
  name?: unknown
}

interface McpListBody {
  servers?: unknown[]
  restartNeeded?: boolean
  error?: string
}

function apiUrl(path: string): string {
  return `${inject('dshBaseUrl')}${ROUTE_PREFIX}${path}`
}

/** `/api/**` 要求浏览器会话；Cookie 由编排在根路径用一次性 token 换得。 */
function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: inject('dshCookie'), ...extra }
}

function jsonHeaders(): Record<string, string> {
  return apiHeaders({ 'content-type': 'application/json' })
}

/** 共享宿主的 scratch HOME 下，插件读写 MCP 行的 patch 文件（`config/constants.ts:9`）。 */
function patchFilePath(): string {
  return join(inject('dshHome'), 'profiles', 'web', 'cordis.patch.yml')
}

function readPatchFile(): string | null {
  const path = patchFilePath()
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

describe('L2 宿主路由', () => {
  it('验证技能清单返回数组结构且不含错误', async () => {
    const response = await fetch(apiUrl('/skills'), { headers: apiHeaders() })

    expect(response.status, '技能清单必须可读').toBe(200)

    const body = await response.json() as SkillsBody
    expect(Array.isArray(body.skills), '响应体必须带 skills 数组字段').toBe(true)
    expect(body.error, '成功路径不得带 error 字段').toBeUndefined()
    expect(body.skills?.every(row => typeof row.name === 'string'), '每行必须带技能名').toBe(true)
  })

  it('[反向] 验证查询不存在的技能返回 404', async () => {
    const response = await fetch(apiUrl('/skill?name=definitely-missing'), { headers: apiHeaders() })

    expect(response.status, '不存在的技能必须 404').toBe(404)

    const body = await response.json() as ErrorBody
    expect(body.error, '404 的领域文案必须精确').toBe('skill not found')
  })

  it('验证 MCP 列表结构固定且标记需要重启', async () => {
    const response = await fetch(apiUrl('/mcp'), { headers: apiHeaders() })

    expect(response.status, 'MCP 列表必须可读').toBe(200)

    const body = await response.json() as McpListBody
    expect(Array.isArray(body.servers), '响应体必须带 servers 数组字段').toBe(true)
    expect(body.restartNeeded, 'MCP 变更恒需重启才生效').toBe(true)
    expect(body.error, '成功路径不得带 error 字段').toBeUndefined()
  })

  it('[反向] 验证 MCP 删除缺 id 返回 400', async () => {
    const before = readPatchFile()
    expect(before, '夹具前置：patch 文件必须由脚手架产出').not.toBeNull()

    const response = await fetch(apiUrl('/mcp'), {
      method: 'DELETE',
      headers: jsonHeaders(),
      body: '{}',
    })

    expect(response.status, '缺 id 必须 400').toBe(400)

    const body = await response.json() as ErrorBody
    expect(body.error, '400 的领域文案必须精确').toBe('id is required')
    expect(body.error, '拒绝的请求不得进入删除分支').not.toContain('not found')
    expect(readPatchFile(), '被拒的删除不得改写 patch 文件').toBe(before)
  })

  it('[反向] 验证 MCP 切换缺字段返回 400', async () => {
    const response = await fetch(apiUrl('/mcp/toggle'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ id: 'x' }),
    })

    expect(response.status, '缺 disabled 必须 400').toBe(400)

    const body = await response.json() as ErrorBody
    expect(body.error, '400 的领域文案必须精确').toBe('id and disabled are required')
  })

  it('[反向] 验证打开目录的未知 target 被拒', async () => {
    const response = await fetch(apiUrl('/open/dir'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ target: 'unknown-target' }),
    })

    expect(response.status, '白名单外的 target 必须 400').toBe(400)

    const body = await response.json() as ErrorBody
    expect(body.error, '400 的领域文案必须精确').toBe('unknown target')
    expect(JSON.stringify(body), '拒绝的请求不得回报打开成功').not.toContain('"ok"')
  })

  it('[反向] 验证技能根创建只接受 local / git', async () => {
    const response = await fetch(apiUrl('/roots'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ kind: 'svn', path: '/tmp' }),
    })

    expect(response.status, '未知 kind 必须 400').toBe(400)

    const body = await response.json() as ErrorBody
    expect(body.error, '400 的领域文案必须精确').toBe('kind must be local or git')
    expect(body.error, '拒绝的请求不得落到缺 path / url 的分支').not.toContain('is required')
  })

  it('[反向] 验证宿主重启在本机无来源头时被拒', async () => {
    const alive = await fetch(apiUrl('/skills'), { headers: apiHeaders() })
    expect(alive.status, '重启前的宿主必须可用').toBe(200)

    const response = await fetch(apiUrl('/host/restart'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: '{}',
    })

    expect(response.status, '无 Origin 的重启请求必须 403').toBe(403)

    const body = await response.json() as ErrorBody
    expect(body.error, '拒绝必须点明来源不可信').toBe('untrusted origin')
    expect(JSON.stringify(body), '被拒的重启不得回报 ok / pid').not.toContain('pid')

    const after = await fetch(apiUrl('/skills'), { headers: apiHeaders() })
    expect(after.status, '宿主必须仍由同一实例服务（未被重启）').toBe(200)
  })

  it('[反向] 验证带转发头的重启请求同样被拒', async () => {
    const origin = new URL(inject('dshBaseUrl')).origin

    const response = await fetch(apiUrl('/host/restart'), {
      method: 'POST',
      headers: apiHeaders({
        'content-type': 'application/json',
        'origin': origin,
        'x-forwarded-for': '10.0.0.1',
      }),
      body: '{}',
    })

    expect(response.status, '带转发头的重启请求必须 403').toBe(403)

    const body = await response.json() as ErrorBody
    expect(body.error, '同源 Origin 也救不回转发头').toBe('untrusted origin')
    expect(JSON.stringify(body), '被拒的重启不得回报 ok / pid').not.toContain('pid')
  })
})
