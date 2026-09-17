import type { RapidMlxModelCard } from '../routes/index.types'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** 首个可用作容量的正整数；非正整数与缺省一律视为「未披露」。 */
function positiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0)
      return value
  }
  return undefined
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0)
      return value
  }
  return undefined
}

/**
 * 把 Rapid-MLX（或任何 OpenAI 兼容端点）的一条 `/v1/models` 纪录收敛成模型条目。
 *
 * 容量优先取 `max_model_len`：它是服务端按本机统一内存算出的可用上限，也是官方
 * Rapid-MLX 适配器喂给 DSH 的同一口径；`context_window` 只在旧服务端缺该字段时兜底。
 * `capabilities` 缺席表示「服务端没回答」，此时不写 `input`，绝不臆测能力。
 */
export function normalizeModelCard(value: unknown): RapidMlxModelCard | undefined {
  const entry = record(value)
  if (entry === undefined)
    return undefined
  const id = text(entry.id)
  if (id === undefined)
    return undefined
  const limit = record(entry.limit)
  const contextWindow = positiveInteger(
    entry.max_model_len,
    entry.context_window,
    entry.context_length,
    entry.max_input_tokens,
    limit?.context,
  )
  const maxTokens = positiveInteger(
    entry.max_output_tokens,
    entry.max_tokens,
    entry.max_completion_tokens,
    limit?.output,
  )
  const name = text(entry.name)
  const capabilities = Array.isArray(entry.capabilities)
    ? entry.capabilities.filter((item): item is string => typeof item === 'string')
    : undefined
  return {
    id,
    ...name === undefined ? {} : { name },
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...capabilities === undefined
      ? {}
      : {
          input: capabilities.includes('vision') ? ['text', 'image'] : ['text'],
        },
  }
}

export function normalizeModelCards(payload: unknown): RapidMlxModelCard[] {
  const body = record(payload)
  const data = Array.isArray(body?.data) ? body.data : []
  const cards: RapidMlxModelCard[] = []
  for (const entry of data) {
    const card = normalizeModelCard(entry)
    if (card !== undefined)
      cards.push(card)
  }
  return cards
}
