/**
 * 批次 06 · `dsh-tauri-ui` 宿主路由（用例来源：`docs/testing/plugins/06-dsh-tauri-ui.md`）。
 *
 * 本批只覆盖续跑路由的两条拒绝分支：缺参（400）与会话不存在（404）。断言对象是外部
 * 世界（HTTP 状态码与响应字节），不采信插件自报；`error` 文案必须逐字相等，否则
 * 「路由在跑」与「路由换了实现」在测试里不可区分。
 *
 * 复用 globalSetup 的共享宿主（`also` 默认已挂载本插件），不另起进程。
 * 运行中 / 已正常结束（409）两条需要真实会话，scratch 宿主无造会话手段，保持待补
 * （`00-overview.md` G9）。
 */

import { describe, expect, inject, it } from 'vitest'

/** 与 `packages/dsh-tauri-ui/src/host/routes/index.ts:5` 的唯一路由对齐。 */
const RESUME_PATH = '/api/desktop/dsh-tauri-ui/session/resume'

/** `/api/**` 要求浏览器会话；Cookie 由编排在根路径用一次性 token 换得。 */
function headers(): Record<string, string> {
  return { 'cookie': inject('dshCookie'), 'content-type': 'application/json' }
}

function url(): string {
  return `${inject('dshBaseUrl')}${RESUME_PATH}`
}

interface ResumeBody {
  error?: string
  ok?: boolean
}

describe('L2 宿主路由', () => {
  it('[反向] 验证续跑缺 sessionId 返回 400', async () => {
    const response = await fetch(url(), { method: 'POST', headers: headers(), body: '{}' })

    expect(response.status, '缺参必须在读体后立刻以 400 结束').toBe(400)

    const body = await response.json() as ResumeBody
    expect(body.error, '缺参文案必须逐字相等，才能与其它 400 区分').toBe('缺少 sessionId')
    expect(JSON.stringify(body), '缺参不得走到注入成功分支').not.toContain('"ok":true')
  })

  it('[反向] 验证未知会话返回 404', async () => {
    const response = await fetch(url(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sessionId: 'does-not-exist' }),
    })

    expect(response.status, '会话不存在必须是 404，而不是 500（服务内部抛错）').toBe(404)

    const body = await response.json() as ResumeBody
    expect(body.error, '会话不存在文案必须逐字相等').toBe('会话不存在或尚未运行')
    expect(JSON.stringify(body), '未知会话不得走到注入成功分支').not.toContain('"ok":true')
  })
})
