import type { PresetRow, PresetTable } from '../../shared/model-presets'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defineService } from 'dsh-tauri'
import { buildPresetTable, PRESET_CACHE_TTL_MS, PRESET_SOURCE_URL } from '../../shared/model-presets'
import { resolvePresetCachePath } from '../utils/paths'

export interface PresetTablePayload {
  source: string
  fetchedAt: string
  presets: PresetTable
}

export type PresetResolveResult
  = | (PresetTablePayload & { ok: true, stale: boolean })
    | { ok: false, error: string }

const FETCH_TIMEOUT_MS = 20_000

interface CachedPayload {
  source: string
  fetchedAt: string
  presets: PresetTable
}

let memory: CachedPayload | undefined

function isPresetRow(value: unknown): value is PresetRow {
  return Array.isArray(value)
    && value.length === 4
    && value.every(fact => typeof fact === 'number' && Number.isFinite(fact))
}

function readPayload(input: unknown): CachedPayload | undefined {
  if (input === null || typeof input !== 'object')
    return undefined
  const candidate = input as Partial<CachedPayload>
  if (typeof candidate.source !== 'string' || typeof candidate.fetchedAt !== 'string')
    return undefined
  if (candidate.presets === null || typeof candidate.presets !== 'object')
    return undefined
  const presets: PresetTable = {}
  for (const [key, row] of Object.entries(candidate.presets)) {
    if (isPresetRow(row))
      presets[key] = row
  }
  if (Object.keys(presets).length === 0)
    return undefined
  return { source: candidate.source, fetchedAt: candidate.fetchedAt, presets }
}

function readDiskPayload(): CachedPayload | undefined {
  try {
    return readPayload(JSON.parse(readFileSync(resolvePresetCachePath(), 'utf8')))
  }
  catch {
    return undefined
  }
}

function writeDiskPayload(payload: CachedPayload): void {
  const path = resolvePresetCachePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(payload))
  }
  catch {
    // 缓存写不进去不影响本次结果，下次再来一遍下载而已。
  }
}

function isFresh(payload: CachedPayload): boolean {
  const fetchedAt = Date.parse(payload.fetchedAt)
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < PRESET_CACHE_TTL_MS
}

async function download(): Promise<CachedPayload> {
  const response = await fetch(PRESET_SOURCE_URL, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(`${PRESET_SOURCE_URL} answered ${response.status}`)
  const presets = buildPresetTable(await response.json())
  if (Object.keys(presets).length === 0)
    throw new Error(`${PRESET_SOURCE_URL} carried no chat models`)
  return { source: PRESET_SOURCE_URL, fetchedAt: new Date().toISOString(), presets }
}

/**
 * 模型能力预设表的宿主侧来源。
 *
 * 表本身不进仓库：首次需要时从上游拉一份，落在 `$DSH_HOME/dsh-tauri-model-config/` 下做缓存，
 * 一天内直接用缓存。上游不可达时宁可用过期缓存也不用空表——端点的容量字段仍然能补上，
 * 缺的只是图片与思考档位。
 */
export const modelPresets = defineService({
  /**
   * 取预设表。
   * @param force - 忽略缓存有效期，强制重新下载。
   * @returns 预设表、来源、抓取时间与是否已过期，或宿主侧自己的失败文案。
   */
  async resolve(force = false): Promise<PresetResolveResult> {
    const cached = memory ?? readDiskPayload()
    if (cached !== undefined)
      memory = cached
    if (!force && cached !== undefined && isFresh(cached))
      return { ok: true, ...cached, stale: false }
    try {
      const fresh = await download()
      memory = fresh
      writeDiskPayload(fresh)
      return { ok: true, ...fresh, stale: false }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (cached !== undefined)
        return { ok: true, ...cached, stale: true }
      return { ok: false, error: message }
    }
  },
})
