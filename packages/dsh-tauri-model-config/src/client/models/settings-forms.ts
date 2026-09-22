import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WelcomeSettingsForm } from './welcome-store.ts'
import {
  WELCOME_NOTICE_SETTINGS_NAMESPACE,
  WELCOME_NOTICE_SETTINGS_NAMESPACE_LEGACY,
} from '../../shared/onboarding-copy.ts'
import { decodeWelcomeSection } from './welcome-store.ts'

/** ≥0.1.7 的 `ctx.configForms`（源文件 `config-form.ts`）。 */
interface ConfigFormsLike {
  describe: () => SettingsDescribeFace
  get: (namespace: string) => WelcomeSettingsForm
}

/** ≤0.1.6 的 `ctx.settingsScope`。 */
interface SettingsScopeLike {
  describe: () => SettingsDescribeFace
  bind: (spec: { namespace: string, decode: (section: unknown) => Record<string, unknown> }) => WelcomeSettingsForm
}

/** 模型页所需的设置读写面，已抹平两代内核的服务名与绑定方式差异。 */
export interface ModelsForms {
  describe: SettingsDescribeFace
  welcome: WelcomeSettingsForm
}

/** 只需要 cordis 的服务查询面，避免依赖 ctx 的宿主/客户端增广差异。 */
export interface ServiceLookup {
  get: (name: string) => unknown
}

/**
 * 探测并解析设置命名空间服务。`configForms` 优先；缺席时退回 `settingsScope`
 * 及其 `bind({namespace, decode})` 绑定形式，并换用该代的欢迎确认命名空间。
 */
export function resolveModelsForms(ctx: ServiceLookup): ModelsForms | undefined {
  const forms = ctx.get('configForms') as ConfigFormsLike | undefined
  if (forms !== undefined) {
    return {
      describe: forms.describe(),
      welcome: forms.get(WELCOME_NOTICE_SETTINGS_NAMESPACE),
    }
  }
  const scope = ctx.get('settingsScope') as SettingsScopeLike | undefined
  if (scope === undefined)
    return undefined
  return {
    describe: scope.describe(),
    welcome: scope.bind({
      namespace: WELCOME_NOTICE_SETTINGS_NAMESPACE_LEGACY,
      decode: decodeWelcomeSection,
    }),
  }
}
