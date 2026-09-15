/**
 * routes/session/open-path/post.ts — POST /session/open-path：在系统文件管理器中
 * 打开归档会话的数据目录。
 *
 * open-path 不接受客户端路径：按 sessionId 在 `$DSH_HOME/sessions/...` 内有界解析
 * 该会话的数据目录后交给系统文件管理器；`openDirectory` 在路径不是目录时抛错，
 * 这里映射为既有的 400 `{ ok: false, error: 'not-a-directory' }`。
 *
 * 请求级逻辑（读体、校验、状态码、响应组织）全部在处理器体内，不留助手层。
 */

import { defineEventHandler, openDirectory, readBody } from 'dsh-tauri'
import { locateSessionDataDir } from '../../../service/session-files'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ sessionId?: unknown }>(event, { type: 'json' })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  if (sessionId.length === 0) {
    event.res.status = 400
    return { ok: false as const, error: 'invalid-session-id' }
  }

  const directory = locateSessionDataDir(sessionId)
  if (!directory) {
    event.res.status = 400
    return { ok: false as const, error: 'session-directory-not-found' }
  }

  try {
    await openDirectory(directory)
  }
  catch {
    // 路径存在但不是目录（或被并发删除）：回客户端可展示的领域错误。
    event.res.status = 400
    return { ok: false as const, error: 'not-a-directory' }
  }
  return { ok: true as const }
})
