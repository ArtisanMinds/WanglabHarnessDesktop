/**
 * routes/restart/post.ts — POST /restart：独立 `dsh web` 的自重启。
 *
 * 进程控制：只有直接的同源回环请求有权触发（回环由 `defineRoutes` 统一把关，
 * 这里再拒一次带转发痕迹的请求——那说明回环对端是代理而不是用户浏览器）。
 * 桌面模式下重启归壳层所有（restartOwnedByShell 返回 409），避免被监督的
 * sidecar 自我替换。
 */

import { defineEventHandler } from 'dsh-tauri'
import { dshLaunch, restartOwnedByShell, scheduleRestart } from '../../service/restart'

export default defineEventHandler((event) => {
  const headers = event.req.headers
  const origin = headers.get('origin')
  const host = headers.get('host')
  // 同源判定：带 Origin 且与 Host 逐字相符才算用户浏览器直连。
  let sameOrigin = false
  if (origin !== null && host !== null) {
    try {
      const parsed = new URL(origin)
      sameOrigin = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
    }
    catch {
      sameOrigin = false
    }
  }
  const forwarded = headers.has('forwarded') || headers.has('x-forwarded-for') || headers.has('x-real-ip')
  if (!sameOrigin || forwarded) {
    event.res.status = 403
    return { error: 'untrusted origin' }
  }
  if (restartOwnedByShell()) {
    event.res.status = 409
    return { error: 'restart is owned by the desktop shell' }
  }
  const { pid, replacementPid, logOut } = scheduleRestart(dshLaunch())
  return { ok: true, pid, replacementPid, logOut }
})
