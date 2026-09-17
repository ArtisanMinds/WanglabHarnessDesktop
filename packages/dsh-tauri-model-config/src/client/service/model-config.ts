import type { RapidMlxModelCard } from '../apis/index.type'
import { getRapidMlxModels, postConfigOpen } from '../apis'

export type ModelConfigFetch
  = | { ok: true, cards: RapidMlxModelCard[] }
    | { ok: false, error: string }

export type ConfigFileOpen
  = | { ok: true, path: string, opened: 'file' | 'directory' }
    | { ok: false, error: string }

/**
 * 读取端点当前服务的模型清单。
 *
 * 请求走宿主路由而不是浏览器：内核 Web 源与模型端点不同源，Rapid-MLX 不带 CORS 头。
 * @param baseURL - 提供方当前的 API 地址；留空时宿主回落到 Rapid-MLX 默认地址。
 * @returns 归一化后的模型条目，或可展示的失败文案。
 */
export async function fetchModelCards(baseURL: string | undefined): Promise<ModelConfigFetch> {
  try {
    const response = await getRapidMlxModels(baseURL === undefined ? {} : { baseURL })
    if (response.error !== undefined)
      return { ok: false, error: response.error }
    return { ok: true, cards: response.models ?? [] }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 让宿主用系统默认程序打开 `$DSH_HOME/settings.yaml`（模型配置所在的设置文档）。 */
export async function openConfigFile(): Promise<ConfigFileOpen> {
  try {
    const response = await postConfigOpen()
    if (response.error !== undefined)
      return { ok: false, error: response.error }
    return { ok: true, path: response.path ?? '', opened: response.opened ?? 'file' }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
