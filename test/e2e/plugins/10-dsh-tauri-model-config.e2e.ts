/**
 * 批次 10 · `dsh-tauri-model-config` 的宿主路由（用例来源：`docs/testing/plugins/10-dsh-tauri-model-config.md`）。
 *
 * 插件顶替官方模型设置页：宿主侧只有 5 条路由，本批覆盖其中 4 条的无会话分支——预设表结构、
 * 端点探测无 endpoint、打开配置文件、设置文件缺失时退回目录。`settings.yaml` 的真实解析与
 * `POST /presets?force=true` 的上游下载由 `packages/dsh-tauri-model-config/src/host/service/`
 * 下的 unit 用例覆盖，不在 L2 重复。
 *
 * 断言对象是外部世界（HTTP 状态码、响应字节、scratch `DSH_HOME` 的文件状态），不采信插件自报。
 * 宿主复用 globalSetup 的共享实例（已挂载 dsh-tauri-model-config），不另起进程。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, inject, it } from 'vitest'

const PRESETS_PATH = '/api/desktop/dsh-tauri-model-config/presets'
const ENDPOINT_MODELS_PATH = '/api/desktop/dsh-tauri-model-config/endpoint/models'
const CONFIG_OPEN_PATH = '/api/desktop/dsh-tauri-model-config/config/open'

/** 设置文件名（`packages/dsh-tauri-model-config/src/shared/constants.ts:4`）。 */
const SETTINGS_FILE = 'settings.yaml'

/** 成功响应必须**恰为**这六个字段——多一个都说明契约变了。 */
const PRESETS_FIELDS = ['ok', 'source', 'fetchedAt', 'stale', 'count', 'presets'] as const

/** 密钥字段名黑名单：服务端从不回显凭据（G-MC-1）。 */
const SECRET_FIELDS = ['apiKey', 'api_key', 'key', 'token'] as const

interface PresetsBody {
  ok?: boolean
  source?: unknown
  fetchedAt?: unknown
  stale?: unknown
  count?: unknown
  presets?: unknown
}

interface ErrorBody {
  ok?: boolean
  error?: unknown
}

interface OpenBody {
  ok?: boolean
  path?: unknown
  opened?: unknown
}

/** `/api/**` 要求浏览器会话；Cookie 由编排在根路径用一次性 token 换得。 */
function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: inject('dshCookie'), ...extra }
}

function url(path: string): string {
  return `${inject('dshBaseUrl')}${path}`
}

function secretFieldsIn(body: unknown): string[] {
  const text = JSON.stringify(body)
  return SECRET_FIELDS.filter(field => text.includes(field))
}

describe('宿主路由：预设表', () => {
  it('验证预设端点返回六个字段且 count 与 presets 长度一致', async () => {
    const response = await fetch(url(PRESETS_PATH), { headers: apiHeaders() })

    expect(
      response.status,
      '预设上游不可达且 scratch DSH_HOME 无缓存时才允许 502；本宿主由 globalSetup 在联网下就绪，'
      + '且 24h TTL 内的缓存会让后续请求稳定 200',
    ).toBe(200)

    const body = await response.json() as PresetsBody
    expect(Object.keys(body).sort(), '成功响应必须恰为六个字段').toEqual([...PRESETS_FIELDS].sort())
    expect(body.ok, 'ok 必须恰为 true').toBe(true)
    expect(typeof body.source, 'source 必须是上游 URL 字符串').toBe('string')
    expect(body.source, 'source 必须是非空上游地址').not.toBe('')
    expect(typeof body.fetchedAt, 'fetchedAt 必须是抓取时间字符串').toBe('string')
    expect(Number.isFinite(Date.parse(body.fetchedAt as string)), 'fetchedAt 必须可解析为时间').toBe(true)
    expect(typeof body.stale, 'stale 必须是布尔值').toBe('boolean')
    expect(typeof body.count, 'count 必须是数字').toBe('number')
    expect(body.presets, 'presets 必须是对象').toBeTypeOf('object')
    expect(body.presets, 'presets 不得为 null').not.toBeNull()

    const presets = body.presets as Record<string, unknown>
    expect(Object.keys(presets).length, 'presets 不得为空表').toBeGreaterThan(0)
    expect(body.count, 'count 必须等于 presets 的条目数').toBe(Object.keys(presets).length)
    for (const row of Object.values(presets))
      expect(Array.isArray(row) && row.length === 4, '每条预设必须是四元数组').toBe(true)
  })
})

describe('宿主路由：端点探测', () => {
  it('[反向] 验证未配置 endpoint 的命名空间返回 502 且不回显凭据字段', async () => {
    const response = await fetch(url(`${ENDPOINT_MODELS_PATH}?ns=nope`), { headers: apiHeaders() })

    expect(response.status, 'settings 命名空间没有 endpoint 时必须 502，而不是 200 或 500').toBe(502)

    const body = await response.json() as ErrorBody
    expect(body.ok, '失败响应必须显式 ok:false').toBe(false)
    expect(typeof body.error, 'error 必须是字符串').toBe('string')
    expect((body.error as string).length, 'error 必须非空').toBeGreaterThan(0)
    expect(secretFieldsIn(body), '失败响应不得出现任何形如密钥的字段').toEqual([])
    expect(secretFieldsIn(response.headers.get('set-cookie') ?? ''), '响应头同样不得带凭据').toEqual([])
  })
})

describe('宿主路由：打开设置文件', () => {
  it('验证打开配置端点返回 scratch DSH_HOME 下的路径与打开方式', async () => {
    const home = inject('dshHome')
    const response = await fetch(url(CONFIG_OPEN_PATH), { method: 'POST', headers: apiHeaders() })

    expect(response.status, '打开动作本身成功时必须 200，失败才是 500').toBe(200)

    const body = await response.json() as OpenBody
    expect(body.ok, 'ok 必须恰为 true').toBe(true)
    expect(typeof body.path, 'path 必须是字符串').toBe('string')
    expect(body.path, 'path 必须是绝对路径').toMatch(/^[A-Z]:\\|^\//)
    expect(
      String(body.path).startsWith(home),
      `path 必须位于 scratch DSH_HOME 之下（实测 path=${String(body.path)} home=${home}）`,
    ).toBe(true)
    expect(['file', 'directory'], 'opened 只能取 file / directory').toContain(body.opened)
  })

  it('验证设置文件缺失时退回打开目录', async () => {
    const home = inject('dshHome')
    const settingsPath = join(home, SETTINGS_FILE)

    expect(existsSync(settingsPath), '前置：宿主首次启动不得代生成 settings.yaml').toBe(false)

    const response = await fetch(url(CONFIG_OPEN_PATH), { method: 'POST', headers: apiHeaders() })

    expect(response.status, '缺文件时退回打开目录，仍是成功 200').toBe(200)

    const body = await response.json() as OpenBody
    expect(body.ok).toBe(true)
    expect(body.opened, '文件不存在时必须恰为 directory').toBe('directory')
    expect(body.path, '退回目录时 path 是 DSH_HOME 目录本身').toBe(home)
  })
})
