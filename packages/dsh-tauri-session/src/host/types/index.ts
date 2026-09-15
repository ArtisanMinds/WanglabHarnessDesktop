export type HostContext = any

export type JsonBody = Record<string, unknown>

export type RouteResult = [number, unknown]
export type RouteFunction = (body: JsonBody, req: import('node:http').IncomingMessage) => Promise<RouteResult>

/** Minimal host session header surface (createdAt/cwd live on the host Session.header). */
export interface SessionHeaderLike {
  createdAt?: number
  cwd?: string
}

/** Minimal host session surface used by this plugin. */
export interface SessionLike {
  id: string
  header?: SessionHeaderLike
  title?: string
  displayTitle?: string
}

/** Wire payload for `GET /api/dsh-session/session/archive`. */
export interface ArchivedListPayload {
  archivedSessionIds: string[]
  /** Per archived session, creation metadata read from the host session header. */
  meta: Record<string, { createdAt?: number, cwd?: string, title?: string }>
}
