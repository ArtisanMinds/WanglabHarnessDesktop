export type HostContext = any

/** 一个待写入模型条目的能力字段集合。 */
export interface RapidMlxModelCard {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
}

export interface GetRapidMlxModelsQuery {
  baseURL?: string
}

export interface RapidMlxModelsResponse {
  ok?: boolean
  models?: RapidMlxModelCard[]
  error?: string
}

export interface OpenModelsConfigResponse {
  ok?: boolean
  path?: string
  opened?: 'file' | 'directory'
  error?: string
}
