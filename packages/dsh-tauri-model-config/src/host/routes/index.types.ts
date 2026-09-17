export type HostContext = any

export interface OpenModelsConfigResponse {
  ok?: boolean
  path?: string
  opened?: 'file' | 'directory'
  error?: string
}
