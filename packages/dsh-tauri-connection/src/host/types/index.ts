import type { ConnectionGate } from 'dsh-tauri'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 宿主日志出口（与 dsh-tauri 其它插件一致的可选注入面）。 */
export interface ConnectionLogger {
  warn?: (message: string, error?: unknown) => void
}

/**
 * 桌面载体鉴权适配要覆写的两道闸门。
 *
 * `requestRejection` 取自 dsh-tauri 的 `ConnectionGate`；`authorizeIndex` 只被
 * frontend-static 以 `() => ctx.connection.authorizeIndex(req, res)` 调用，返回值即
 * 「index 是否继续由调用方写出」，因此按调用点在这里补齐。
 */
export interface ConnectionHost {
  connection: ConnectionGate & {
    authorizeIndex: (request: IncomingMessage, response: ServerResponse) => boolean
  }
  logger?: ConnectionLogger
}
