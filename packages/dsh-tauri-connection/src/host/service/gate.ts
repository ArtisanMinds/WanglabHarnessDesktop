import type { IncomingMessage } from 'node:http'
import process from 'node:process'
import { defineService } from 'dsh-tauri'
import { PLUGIN_ID } from '../../shared/constants'
import { getCurrentHostInstance } from '../config/runtime'

/**
 * 桌面壳在 spawn 时注入的载体标记；与 `src-tauri/src/service/workflow/launch.rs` 的
 * envs 注入点逐字一致。未注入时本插件完全不接管鉴权，同一 profile 下独立运行的
 * `dsh web` 保持 browser-session 鉴权。
 */
const EMBEDDED_ENV = 'DSH_TAURI_EMBEDDED'

/**
 * 桌面载体鉴权适配。
 *
 * 内嵌 WebView 是 `tauri.localhost` 下的跨源沙箱 iframe，`SameSite=Strict` 的
 * browser-session Cookie 不会被携带，根路径 token 交换也就无法完成。这里在
 * `connection` 服务实例上覆写两道闸门：`requestRejection` 保留 Host/Origin fence
 * 的 403、只把 401 降级为放行；`authorizeIndex` 直接放行 index。
 */
export const gate = defineService({
  attach(): () => void {
    if (process.env[EMBEDDED_ENV] !== '1') {
      return noop
    }

    const { connection } = getCurrentHostInstance()
    const rejection = connection.requestRejection
    const authorize = connection.authorizeIndex
    if (typeof rejection !== 'function' || typeof authorize !== 'function') {
      warn('connection 服务缺少 requestRejection/authorizeIndex，桌面载体鉴权适配未生效')
      return noop
    }

    connection.requestRejection = (request: IncomingMessage) => {
      const rejected = rejection.call(connection, request)
      return rejected === 401 ? undefined : rejected
    }
    connection.authorizeIndex = () => true

    return () => {
      connection.requestRejection = rejection
      connection.authorizeIndex = authorize
    }
  },
})

// --- internal ---

function noop(): void {}

function warn(message: string): void {
  try {
    getCurrentHostInstance().logger?.warn?.(`[${PLUGIN_ID}] ${message}`)
  }
  catch {}
}
