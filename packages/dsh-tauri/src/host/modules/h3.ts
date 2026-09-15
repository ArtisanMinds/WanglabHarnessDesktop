/**
 * host/modules/h3.ts — h3 v2 面的统一转出（插件不直接依赖 `h3` 包）。
 *
 * 只转出**未被 h3 v2 废弃**的成员；插件侧对应写法：
 *   - 状态码：`event.res.status = 400`（`event.res.statusText` 写文案）——
 *     不要用已废弃的 `setResponseStatus`；
 *   - 抛错：`new HTTPError({ status: 400, statusText: '...' })`——
 *     不要用已废弃的 `createError` / `H3Error`；
 *   - 读头：`event.req.headers.get(name)`——不要用已废弃的 `getHeader`；
 *   - 请求体 / 查询串仍用 h3 内置的 `readBody` / `getQuery`（v2 未废弃）；
 *   - SSE：`new EventStream(event)` + `push` / `pushComment` / `onClosed` / `close`，
 *     处理器直接 `return stream`（`EventStream` 继承 `HTTPResponse`）。
 */

export { bodyLimit, defineEventHandler, EventStream, getQuery, HTTPError, readBody, readRawBody } from 'h3'
export type { EventHandler, EventStreamMessage, EventStreamOptions, H3Event } from 'h3'
