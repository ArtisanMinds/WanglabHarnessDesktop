import type { DeepSeekModelDraft } from '../models/DeepSeekModelsEditor.tsx'
import type { LlmDiscoveredModel } from '../types/remotes.ts'

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

/**
 * 打开「思考模式」时写入的档位声明。
 *
 * 键是档位，值是分发给端点时使用的线值（只有 `off` 允许为空）。这一组与官方 pi-ai 目录
 * 给自建路由的默认档位一致，也是参考实现（dsh-llm-capabilities）的默认值：声明 off/low/
 * medium/high 四档，端点按自己的语义解释。
 */
export const DEFAULT_THINKING_EFFORTS: Readonly<Record<string, string | null>> = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
}

/**
 * 该条目是否已声明提供思考档位。
 *
 * `reasoningEfforts` 为 `false` 表示显式「不支持思考」，缺席表示「继承默认」，两者在
 * 开关上都读为关；只有含 `off` 以外档位的对象才算打开——只声明 `off` 的条目在 schema
 * 校验里本就不合法，等于没有可用的思考档位。
 */
export function supportsThinking(model: DeepSeekModelDraft): boolean {
  const efforts = model.reasoningEfforts
  if (typeof efforts !== 'object' || efforts === null || Array.isArray(efforts))
    return false
  return Object.keys(efforts).some(level => level !== 'off')
}

/** 开关状态对应的 `reasoningEfforts` 声明值。 */
export function thinkingEffortsValue(next: boolean): Record<string, string | null> | false {
  return next ? { ...DEFAULT_THINKING_EFFORTS } : false
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
 * @param discovered - 端点披露的模型条目。
 * @param targets - 参与并入的条目 id；缺省为全部。
 * @returns 并入后的条目、补齐计数与端点未披露的 id。
 */
export function mergeModelCards(
  models: readonly DeepSeekModelDraft[],
  discovered: readonly LlmDiscoveredModel[],
  targets?: readonly string[],
): ModelConfigMerge {
  const byId = new Map(discovered.map(model => [model.id, model]))
  const selected = targets === undefined ? undefined : new Set(targets)
  let applied = 0
  const undisclosed: string[] = []
  const next = models.map((model) => {
    const id = typeof model.id === 'string' ? model.id : ''
    if (selected !== undefined && !selected.has(id))
      return model
    const found = byId.get(id)
    if (found === undefined) {
      if (id.length > 0)
        undisclosed.push(id)
      return model
    }
    const patch: Record<string, unknown> = {}
    if (model.contextWindow === undefined && found.contextWindow !== undefined)
      patch.contextWindow = found.contextWindow
    if (model.maxTokens === undefined && found.maxTokens !== undefined)
      patch.maxTokens = found.maxTokens
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

/**
 * 组合一次端点读取的结果文案：填了多少、有多少条目端点没披露。
 * @param merge - {@link mergeModelCards} 的结果。
 * @param templates - 三段的文案模板（已本地化）。
 * @param templates.applied - 已填入若干条目时的模板。
 * @param templates.none - 一个字段都没补上时的模板。
 * @param templates.undisclosed - 端点未披露若干条目时的模板。
 * @returns 可直接渲染的一行结果。
 */
export function modelConfigNotice(
  merge: Pick<ModelConfigMerge, 'applied' | 'undisclosed'>,
  templates: { applied: string, none: string, undisclosed: string },
): string {
  if (merge.applied === 0 && merge.undisclosed.length === 0)
    return templates.none
  const parts: string[] = []
  if (merge.applied > 0)
    parts.push(withCount(templates.applied, merge.applied))
  if (merge.undisclosed.length > 0)
    parts.push(withCount(templates.undisclosed, merge.undisclosed.length))
  return parts.join(' ')
}
