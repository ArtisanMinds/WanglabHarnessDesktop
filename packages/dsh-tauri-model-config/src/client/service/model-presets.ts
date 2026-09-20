import type { PresetRow, PresetTable } from '../../shared/model-presets'

/**
 * 模型能力预设。
 *
 * 表由宿主侧从 LiteLLM 的模型价目/容量表现取（见 `src/host/service/model-presets.ts`），给出
 * 「支持图片 / 支持思考 / 上下文上限 / 输出上限」四项事实；表里没收录的型号再由家族规则补一条
 * 结论。预设只是起步值：端点披露的容量优先，用户可以随时在高级区改；两项能力只写「能」的结论，
 * 数据集没表态的那一项留空，不会被写成显式的「不支持」。
 */

/**
 * 预设给出的能力；缺席的字段表示预设没有结论。
 *
 * `input` 只可能声明「收图片」，`efforts` 只可能声明「有档位」——预设不做减法：数据集没表态
 * 的模态与档位不写进模型条目，让它们保持「继承默认」，而不是被写成显式的「不支持」。
 */
export interface ModelCapabilityPreset {
  input?: readonly string[]
  efforts?: Readonly<Record<string, string | null>>
  contextWindow?: number
  maxTokens?: number
}

interface FamilyRule {
  pattern: RegExp
  vision?: boolean
  reasoning?: boolean
}

const GRADED = { off: null, low: 'low', medium: 'medium', high: 'high' } as const

/** 前缀匹配允许的最短键：再短就可能把无关型号误认成某个家族。 */
const MIN_PREFIX_LENGTH = 3

/**
 * 家族规则：只在表没给出结论时补一条「能」。
 *
 * 规则只做加法——上游数据集说不能、或没收录，都不妨碍这里按命名标记补上图片与思考能力
 * （`glm-4v`、`kimi-k2-thinking`、`seed-1.6` 这类名字本身就是声明）。反过来不做减法：
 * 把模型判成只能读文字会让用户发不出图片，代价比多勾一个开关大得多。
 */
const FAMILY_RULES: readonly FamilyRule[] = [
  { pattern: /\bclaude/, vision: true },
  { pattern: /\bgemini/, vision: true },
  { pattern: /\bgrok-[2-9]/, vision: true },
  { pattern: /[-.]vl(?:-|$)|[-.]vision(?:-|$)|[-.]omni(?:-|$)/, vision: true },
  { pattern: /\bglm-[\d.]+v/, vision: true },
  { pattern: /(?:^|[/-])seed-1\.[6-9]|\bdoubao-seed|\bseed-[2-9]/, vision: true, reasoning: true },
  { pattern: /\bgpt-5/, vision: true, reasoning: true },
  { pattern: /\bglm-(?:4\.[5-9]|5|z)/, reasoning: true },
  { pattern: /[-.]thinking(?:-|$)|[-.]reasoning(?:-|$)/, reasoning: true },
  { pattern: /(?:^|[/-])(?:r1|qwq|reasoner)(?:-|$)/, reasoning: true },
  { pattern: /\bminimax-m[12]/, reasoning: true },
  { pattern: /\bqwen3/, reasoning: true },
  { pattern: /\bo[1-9](?:-|$)/, reasoning: true },
]

let table: PresetTable = {}

/** 装入宿主取回的预设表；空表表示这次没取到，家族规则仍然生效。 */
export function setPresetTable(next: PresetTable): void {
  table = next
}

/** 当前预设表的条目数（0 表示只剩家族规则）。 */
export function presetTableSize(): number {
  return Object.keys(table).length
}

function ruleFacts(id: string): { vision: boolean, reasoning: boolean } | undefined {
  let vision = false
  let reasoning = false
  let matched = false
  for (const rule of FAMILY_RULES) {
    if (!rule.pattern.test(id))
      continue
    matched = true
    vision = vision || rule.vision === true
    reasoning = reasoning || rule.reasoning === true
  }
  return matched ? { vision, reasoning } : undefined
}

/**
 * 把数据集的一行与家族规则合成一条预设。
 *
 * 只写「能」的结论：数据集把 0 用作「没有给出这项事实」，家族规则也只按命名补「能」，所以两者
 * 都没给出结论时该字段缺席。把「未知」写成 `input: ['text']` / `reasoningEfforts: false` 会替用户
 * 否决掉部署真实具备的能力——本地端点上的模型往往比数据集新，自动配置又会覆盖行内旧值，代价是把
 * 已经声明的思考与图片能力直接关掉。
 * @param row - 数据集里该模型的一行事实。
 * @param rule - 家族规则给出的结论，没有规则命中时为 undefined。
 * @returns 只含正向结论的预设。
 */
function combine(row: PresetRow | undefined, rule: { vision: boolean, reasoning: boolean } | undefined): ModelCapabilityPreset {
  const vision = row?.[0] === 1 || rule?.vision === true
  const reasoning = row?.[1] === 1 || rule?.reasoning === true
  const maxInput = row?.[2] ?? 0
  const maxOutput = row?.[3] ?? 0
  return {
    ...vision ? { input: ['text', 'image'] } : {},
    ...reasoning ? { efforts: { ...GRADED } } : {},
    ...maxInput === 0 ? {} : { contextWindow: maxInput },
    ...maxOutput === 0 ? {} : { maxTokens: maxOutput },
  }
}

/**
 * 查表用的候选键，自具体到宽泛：原样 → provider 前缀之后 → 逐段去掉尾部。
 *
 * 逐段回退覆盖端点上常见的日期与发布后缀（`gpt-4o-2024-08-06` → `gpt-4o`、
 * `claude-3-5-sonnet-20241022` → `claude-3-5-sonnet`）。
 * @param id - 已小写化的模型 id。
 * @returns 按优先级排列的候选键。
 */
function candidateKeys(id: string): string[] {
  const keys: string[] = []
  const push = (value: string): void => {
    if (value.length > 0 && !keys.includes(value))
      keys.push(value)
  }
  const slash = id.lastIndexOf('/')
  const bare = slash >= 0 ? id.slice(slash + 1) : id
  push(id)
  push(bare)
  const segments = bare.split('-')
  for (let end = segments.length - 1; end > 0; end--) {
    const prefix = segments.slice(0, end).join('-')
    if (prefix.length < MIN_PREFIX_LENGTH)
      break
    push(prefix)
  }
  return keys
}

/**
 * 按模型 id 取能力预设。
 * @param id - 端点上的模型 id（可带 provider 前缀、日期后缀），大小写不敏感。
 * @returns 命中的预设，或 undefined（预设也不认识这个模型）。
 */
export function presetFor(id: string): ModelCapabilityPreset | undefined {
  const normalized = id.trim().toLowerCase()
  if (normalized.length === 0)
    return undefined
  let row: PresetRow | undefined
  for (const key of candidateKeys(normalized)) {
    const hit = table[key]
    if (hit !== undefined) {
      row = hit
      break
    }
  }
  const rule = ruleFacts(normalized)
  if (row === undefined && rule === undefined)
    return undefined
  return combine(row, rule)
}
