import type * as Types from './index.type'
import { fetch } from 'dsh-tauri/client'
import { SESSION_API_PREFIX } from '../../shared/constants'

export const baseURL = SESSION_API_PREFIX

/** 归档资源根：`/api/dsh-session/session/archive`。 */
const SESSION_ARCHIVE = `${baseURL}/session/archive`

/** 工作区归档资源根：`/api/dsh-session/session/workspace/archive`。 */
const SESSION_WORKSPACE_ARCHIVE = `${baseURL}/session/workspace/archive`

/** @method get 查询归档会话列表。 */
export function getArchived(): Promise<Types.ArchivedListPayload> {
  return fetch(SESSION_ARCHIVE)
}

/** @method post 在系统文件管理器中打开归档会话的数据目录。 */
export function postOpenSessionDir(body: Types.PostOpenSessionDirBody): Promise<Types.SessionActionResult> {
  return fetch(`${baseURL}/session/open-path`, { method: 'POST', body })
}

/** @method post 归档单个会话。 */
export function postArchive(body: Types.PostArchiveBody): Promise<Types.ArchivedListPayload> {
  return fetch(SESSION_ARCHIVE, { method: 'POST', body })
}

/** @method post 取消归档（会话回到其工作区组保留的位置）。 */
export function postUnarchive(body: Types.PostSessionIdBody): Promise<Types.SessionActionResult> {
  return fetch(`${baseURL}/session/unarchive`, { method: 'POST', body })
}

/** @method delete 彻底删除一个归档会话（宿主移除 + 物理删除会话数据，不可恢复）。 */
export function postDelete(body: Types.PostSessionIdBody): Promise<Types.SessionActionResult> {
  return fetch(SESSION_ARCHIVE, { method: 'DELETE', body })
}

/** @method post 归档整个工作区组（一次写入多条记录）。 */
export function postArchiveWorkspace(body: Types.PostArchiveWorkspaceBody): Promise<Types.ArchivedListPayload> {
  return fetch(SESSION_WORKSPACE_ARCHIVE, { method: 'POST', body })
}

/** @method post 清空归档（全部会话彻底删除，不可恢复）。 */
export function postClear(): Promise<Types.SessionActionResult> {
  return fetch(`${SESSION_ARCHIVE}/clear`, { method: 'POST', body: {} })
}

/** @method delete 删除项目内的全部归档会话。 */
export function postDeleteWorkspace(body: Types.PostDeleteWorkspaceBody): Promise<Types.SessionActionResult> {
  return fetch(SESSION_WORKSPACE_ARCHIVE, { method: 'DELETE', body })
}
