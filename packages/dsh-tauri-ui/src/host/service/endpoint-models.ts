import type { EndpointModelCard } from '../routes/index.types'
import { defineService } from 'dsh-tauri'
import { getCurrentHostInstance } from '../config/runtime'
import {
  apiKeyRefOf,
  endpointOf,
  getPath,
  modelsListingUrl,
  normalizeEndpointModels,
  parseProfilePath,
} from './endpoint-models.utils'

export interface EndpointModelsInput {
  ns: string
  profilePath?: string
  baseURL?: string
  apiKey?: string
}

export type EndpointModelsResult
  = | { ok: true, url: string, models: EndpointModelCard[] }
    | { ok: false, error: string }

const FETCH_TIMEOUT_MS = 15_000

interface SettingsService {
  get: (ns: string) => unknown
}

interface CredentialsService {
  resolve: (ref: string) => Promise<{ value?: string } | undefined>
}

async function resolveApiKey(ref: string | undefined, typed: string | undefined): Promise<string | undefined> {
  const trimmed = typed?.trim()
  if (trimmed !== undefined && trimmed.length > 0)
    return trimmed
  if (ref === undefined)
    return undefined
  try {
    const credentials = getCurrentHostInstance().get('credentials') as CredentialsService | undefined
    if (credentials === undefined)
      return undefined
    const hit = await credentials.resolve(ref)
    return typeof hit?.value === 'string' && hit.value.length > 0 ? hit.value : undefined
  }
  catch {
    return undefined
  }
}

export const endpointModels = defineService({
  async list(input: EndpointModelsInput): Promise<EndpointModelsResult> {
    const settings = getCurrentHostInstance().get('settings') as SettingsService | undefined
    const section = settings?.get(input.ns)
    const path = parseProfilePath(input.profilePath)
    const profile = path.length === 0 ? section : getPath(section, path)
    const baseURL = endpointOf(profile, input.baseURL)
    if (baseURL === undefined) {
      return { ok: false, error: `settings namespace "${input.ns}" names no endpoint to read` }
    }
    const url = modelsListingUrl(baseURL)
    const apiKey = await resolveApiKey(apiKeyRefOf(profile), input.apiKey)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        const hint = response.status === 401 || response.status === 403 ? '; check the API key' : ''
        return { ok: false, error: `${url} answered ${response.status}${hint}` }
      }
      const models = normalizeEndpointModels(await response.json())
      if (models === undefined)
        return { ok: false, error: `${url} model listing has no "data" array` }
      return { ok: true, url, models }
    }
    catch (error) {
      return { ok: false, error: `could not reach ${url}: ${error instanceof Error ? error.message : String(error)}` }
    }
  },
})
