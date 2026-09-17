import type { RapidMlxModelCard } from '../apis/index.type'
import type { DeepSeekModelDraft } from '../models/DeepSeekModelsEditor.tsx'

/** 一个模型条目除身份字段外还带有的配置字段。 */
const CONFIG_FIELDS = ['contextWindow', 'maxTokens', 'input', 'reasoningEfforts'] as const

/**
 * 该条目是否还只是「身份」——只有 id/name/description，没有任何能力配置。
 * 「获取配置」按钮只在这种条目上出现：已经配置过的行不提供一个会把用户手写值
 * 覆盖掉的入口。
 */
export function hasModelConfig(model: DeepSeekModelDraft): boolean {
  return CONFIG_FIELDS.some(field => model[field] !== undefined)
}

/**
 * 该条目是否已声明接受图片。
 *
 * `input` 缺席表示「继承默认」，此时开关读为关：显式写入 `['text']` 才是「只收文本」，
 * 这两种状态在设置文档里是不同的事实，开关只表达显式声明的那一种。
 */
export function supportsImageInput(model: DeepSeekModelDraft): boolean {
  const input = model.input
  return Array.isArray(input) && input.includes('image')
}

/** 开关状态对应的 `input` 声明值。 */
export function imageInputValue(next: boolean): string[] {
  return next ? ['text', 'image'] : ['text']
}

export interface ModelConfigMerge {
  models: DeepSeekModelDraft[]
  /** 至少补齐了一个字段的条目数。 */
  applied: number
  /** 端点没有披露、因此没被补齐的条目 id。 */
  undisclosed: string[]
}

/**
 * 把端点披露的模型条目并入草稿。
 *
 * 只补空缺字段，不覆盖已有值：这是「配置」而不是「重置」，用户手写或上次拉取的
 * 结果不会被一次点击抹掉；`targets` 限定参与并入的条目 id，缺省表示列表里的全部。
 * @param models - 当前草稿条目。
 * @param cards - 端点披露的模型条目。
 * @param targets - 参与并入的条目 id；缺省为全部。
 * @returns 并入后的条目、补齐计数与端点未披露的 id。
 */
export function mergeModelCards(
  models: readonly DeepSeekModelDraft[],
  cards: readonly RapidMlxModelCard[],
  targets?: readonly string[],
): ModelConfigMerge {
  const byId = new Map(cards.map(card => [card.id, card]))
  const selected = targets === undefined ? undefined : new Set(targets)
  let applied = 0
  const undisclosed: string[] = []
  const next = models.map((model) => {
    const id = typeof model.id === 'string' ? model.id : ''
    if (selected !== undefined && !selected.has(id))
      return model
    const card = byId.get(id)
    if (card === undefined) {
      if (id.length > 0)
        undisclosed.push(id)
      return model
    }
    const patch: Record<string, unknown> = {}
    if (model.contextWindow === undefined && card.contextWindow !== undefined)
      patch.contextWindow = card.contextWindow
    if (model.maxTokens === undefined && card.maxTokens !== undefined)
      patch.maxTokens = card.maxTokens
    if (model.input === undefined && card.input !== undefined)
      patch.input = [...card.input]
    if (Object.keys(patch).length === 0)
      return model
    applied += 1
    return { ...model, ...patch }
  })
  return { models: next, applied, undisclosed }
}

/** 填入文案里 `{detail}` 占位符。 */
export function withDetail(template: string, detail: string): string {
  return template.replace('{detail}', () => detail)
}

/** 填入文案里 `{path}` 占位符。 */
export function withPath(template: string, path: string): string {
  return template.replace('{path}', () => path)
}

/** 填入文案里 `{n}` 占位符。 */
export function withCount(template: string, count: number): string {
  return template.replace('{n}', () => String(count))
}
