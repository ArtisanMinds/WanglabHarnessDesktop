import type { RapidMlxModelCard } from '../routes/index.types'
import { defineService } from 'dsh-tauri'
import { RAPID_MLX_DEFAULT_BASE_URL } from '../../shared/constants'
import { normalizeModelCards } from './rapid-mlx.utils'

export type ModelsFetchResult
  = | { ok: true, models: RapidMlxModelCard[] }
    | { ok: false, error: string }

const FETCH_TIMEOUT_MS = 8000

function modelsUrl(baseURL: string | undefined): string {
  const base = (baseURL ?? '').trim().length > 0 ? (baseURL as string).trim() : RAPID_MLX_DEFAULT_BASE_URL
  return `${base.replace(/\/+$/, '')}/models`
}

export const rapidMlx = defineService({
  /**
   * 从模型端点读取它当前服务的模型清单。
   *
   * 请求由宿主进程发出而不是浏览器：内核 Web 源（`127.0.0.1:3080`）直连 `localhost:8000`
   * 属于跨源请求，而 Rapid-MLX 不带 CORS 头，浏览器侧必然被拦。
   * @param baseURL - 提供方当前的 API 地址；留空时回落到 Rapid-MLX 默认地址。
   * @returns 归一化后的模型条目，或宿主侧自己的失败文案。
   */
  async fetchModels(baseURL: string | undefined): Promise<ModelsFetchResult> {
    const url = modelsUrl(baseURL)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!response.ok)
        return { ok: false, error: `${url} 返回 HTTP ${response.status}` }
      return { ok: true, models: normalizeModelCards(await response.json()) }
    }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
})
