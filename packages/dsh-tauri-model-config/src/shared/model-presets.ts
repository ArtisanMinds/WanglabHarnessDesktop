/**
 * 模型能力预设的取数口径。
 *
 * 数据来自 LiteLLM 维护的模型价目/容量表，它给出「支持图片 / 支持思考 / 最大输入 / 最大输出」
 * 四项事实。取数在宿主侧完成，插件本身不内嵌数据集。
 */

export type PresetRow = readonly [number, number, number, number]

export type PresetTable = Record<string, PresetRow>

/**
 * 上游数据集：LiteLLM 维护的模型价目/容量表（MIT），与 <https://models.litellm.ai/> 同源。
 *
 * 没有走 `litellm-api.up.railway.app` 的公开接口：那是 LiteLLM 的 demo 代理，固定在自己那份
 * LiteLLM 版本上（实测 1.82.6），表比主干旧一截（1020 vs 1424 条 chat 模型），新模型会缺席。
 * 该接口只提供全量，`/models/{model_id}` 之类又需要密钥、且只回答「代理自己部署了哪些模型」。
 */
export const PRESET_SOURCE_URL
  = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

export const PRESET_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

function factsOf(entry: Record<string, unknown>): PresetRow {
  return [
    entry.supports_vision === true ? 1 : 0,
    entry.supports_reasoning === true ? 1 : 0,
    positiveInteger(entry.max_input_tokens),
    positiveInteger(entry.max_output_tokens),
  ]
}

/** 键取 provider 前缀之后的末段并小写：同一模型被多家 provider 收录时只留一份。 */
function bareKey(key: string): string {
  const normalized = key.trim().toLowerCase()
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? normalized : normalized.slice(slash + 1)
}

function unionRow(current: PresetRow | undefined, row: PresetRow): PresetRow {
  if (current === undefined)
    return row
  return [current[0] || row[0], current[1] || row[1], Math.max(current[2], row[2]), Math.max(current[3], row[3])]
}

/**
 * 把上游数据集压成预设表。
 *
 * 口径：只保留 `mode === "chat"` 且至少带一项事实的条目；事实与更短前缀完全一致的日期/发布
 * 后缀变体被剪掉，交给查询期的前缀匹配覆盖（`gpt-4o-2024-08-06` → `gpt-4o`）。
 * @param payload - 上游数据集解析后的内容。
 * @returns 模型 id → `[支持图片, 支持思考, 最大输入, 最大输出]`，0 表示数据集没有给出这项事实。
 */
export function buildPresetTable(payload: unknown): PresetTable {
  const merged = new Map<string, PresetRow>()
  if (payload === null || typeof payload !== 'object')
    return {}
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object')
      continue
    const entry = value as Record<string, unknown>
    if (entry.mode !== 'chat')
      continue
    const bare = bareKey(key)
    if (bare.length === 0 || bare === 'sample_spec')
      continue
    const row = factsOf(entry)
    if (row.every(fact => fact === 0))
      continue
    merged.set(bare, unionRow(merged.get(bare), row))
  }
  const pruned: PresetTable = {}
  for (const key of [...merged.keys()].sort((left, right) => left.length - right.length)) {
    const row = merged.get(key) as PresetRow
    const segments = key.split('-')
    let covered = false
    for (let end = segments.length - 1; end > 0 && !covered; end--) {
      const prefix = merged.get(segments.slice(0, end).join('-'))
      if (prefix !== undefined && prefix.every((fact, index) => fact === row[index]))
        covered = true
    }
    if (!covered)
      pruned[key] = row
  }
  return pruned
}
