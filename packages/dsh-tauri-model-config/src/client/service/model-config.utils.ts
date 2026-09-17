import type { DeepSeekModelDraft } from '../models/DeepSeekModelsEditor.tsx'
import type { LlmDiscoveredModel } from '../types/remotes.ts'

/** 一个模型条目除身份字段外还带有的配置字段。 */
const CONFIG_FIELDS = ['contextWindow', 'maxTokens', 'input', 'reasoningEfforts'] as const

/** 官方 pi-ai 档位词表；`off` 之外的每个档位都必须带上分发用的线值。 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** 打开「思考模式」时的初始档位，与官方 pi-ai 目录给自建路由的默认档位一致。 */
export const DEFAULT_THINKING_EFFORTS: Readonly<Record<string, string | null>> = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
}

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

/** 该条目当前的档位声明；缺席、`false` 或非对象都读作空表。 */
export function thinkingEffortsOf(model: DeepSeekModelDraft): Record<string, string | null> {
  const efforts = model.reasoningEfforts
  if (typeof efforts !== 'object' || efforts === null || Array.isArray(efforts))
    return {}
  return efforts as Record<string, string | null>
}

/** 该条目已声明的档位名，用于渲染勾选态。 */
export function declaredThinkingLevels(model: DeepSeekModelDraft): string[] {
  return Object.keys(thinkingEffortsOf(model))
}

/**
 * 该条目是否已声明提供思考档位。
 *
 * `reasoningEfforts` 为 `false` 表示显式「不支持思考」，缺席表示「继承默认」，两者在
 * 开关上都读为关；只有含 `off` 以外档位的对象才算打开——只声明 `off` 的条目在 schema
 * 校验里本就不合法，等于没有可用的思考档位。
 */
export function supportsThinking(model: DeepSeekModelDraft): boolean {
  return Object.keys(thinkingEffortsOf(model)).some(level => level !== 'off')
}

/** 打开思考模式：保留已有的可用档位（含自定义档位），一个都没有时给默认四档。 */
export function enableThinking(model: DeepSeekModelDraft): Record<string, string | null> {
  const current = thinkingEffortsOf(model)
  const graded = Object.keys(current).filter(level => level !== 'off')
  return graded.length === 0 ? { ...DEFAULT_THINKING_EFFORTS } : current
}

/**
 * 勾选/取消一个档位的声明。
 *
 * 取消到空表时写 `false`（显式「不支持思考」）而不是空对象：空表会被 schema 判为非法声明。
 * @param efforts - 当前的档位声明。
 * @param level - 被切换的档位。
 * @param enabled - 勾选为添加，取消为删除。
 * @returns 新的声明值。
 */
export function toggleThinkingLevel(
  efforts: Readonly<Record<string, string | null>>,
  level: string,
  enabled: boolean,
): Record<string, string | null> | false {
  const next = { ...efforts }
  if (enabled)
    next[level] = level === 'off' ? null : level
  else
    delete next[level]
  return Object.keys(next).length === 0 ? false : next
}

export interface ModelConfigMerge {
  models: DeepSeekModelDraft[]
  /** 至少写入了一个字段的条目数。 */
  applied: number
  /** 端点没有披露、因此没被补上的条目 id。 */
  undisclosed: string[]
}

export interface ModelConfigMergeOptions {
  /** 参与并入的条目 id；缺省为列表里的全部。 */
  targets?: readonly string[]
  /**
   * 是否改写已有值。批量「自动配置所有模型」为 true（按钮的语义就是重新配置），
   * 单行的「获取配置」为 false（它只出现在没有任何配置的条目上）。
   */
  overwrite?: boolean
}

/**
 * 把端点披露的模型容量并入草稿。
 * @param models - 当前草稿条目。
 * @param discovered - 端点披露的模型条目。
 * @param options - 参与并入的目标与是否改写已有值。
 * @returns 并入后的条目、写入计数与端点未披露的 id。
 */
export function mergeModelCards(
  models: readonly DeepSeekModelDraft[],
  discovered: readonly LlmDiscoveredModel[],
  options: ModelConfigMergeOptions = {},
): ModelConfigMerge {
  const byId = new Map(discovered.map(model => [model.id, model]))
  const selected = options.targets === undefined ? undefined : new Set(options.targets)
  const overwrite = options.overwrite === true
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
    if (found.contextWindow !== undefined && (overwrite || model.contextWindow === undefined))
      patch.contextWindow = found.contextWindow
    if (found.maxTokens !== undefined && (overwrite || model.maxTokens === undefined))
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
 * 组合一次端点读取的结果文案：写了多少、有多少条目端点没披露。
 * @param merge - {@link mergeModelCards} 的结果。
 * @param templates - 三段的文案模板（已本地化）。
 * @param templates.applied - 已写入若干条目时的模板。
 * @param templates.none - 一个字段都没写时的模板。
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
