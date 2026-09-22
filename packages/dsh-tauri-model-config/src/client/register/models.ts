import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DeepSeekOnboardingInjected } from '../models/DeepSeekOnboardingDialog.tsx'
import type { ModelsSectionInjected } from '../models/ModelsSection.tsx'
import type { WelcomeNoticeInjected } from '../models/WelcomeNotice.tsx'
import type { ClientRemote } from '../types/remotes.ts'
import { defineRegister } from 'dsh-tauri/client'
import { locale } from '../locales'
import { DeepSeekOnboardingDialog } from '../models/DeepSeekOnboardingDialog.tsx'
import { ModelsSection } from '../models/ModelsSection.tsx'
import { createModelsOperations } from '../models/operations.ts'
import { createSettingsSchemaOperations } from '../models/schema-operations.ts'
import { resolveModelsForms } from '../models/settings-forms.ts'
import { ModelsSettingsStore } from '../models/store.ts'
import { WelcomeNoticeStore } from '../models/welcome-store.ts'
import { WelcomeNotice } from '../models/WelcomeNotice.tsx'
import { openConfigFile } from '../service/model-config.ts'

function refreshIfLoaded(controller: ModelsSettingsStore): void {
  if (controller.store.getSnapshot().status === 'idle')
    return
  void controller.load()
}

function remoteOf(ctx: ClientContext): ClientRemote | undefined {
  return ctx.get('remote') as ClientRemote | undefined
}

/** 装配 fork 自官方 `ui-settings-models` 的模型设置页与其引导对话框。 */
export const registerModelsPage = defineRegister<ClientContext>((controller, ctx) => {
  const remote = remoteOf(ctx)
  const schema = createSettingsSchemaOperations(ctx.settingsSchema)
  const operations = createModelsOperations(remote as ClientRemote)
  const forms = resolveModelsForms(ctx)
  if (forms === undefined)
    return
  const page = new ModelsSettingsStore(remote as ClientRemote, schema, forms.describe)
  const t = locale.text as ModelsSectionInjected['t']
  const injected = (): ModelsSectionInjected => ({
    controller: page,
    hooks: { snapshot: page.store },
    operations,
    schema,
    t,
    openConfig: openConfigFile,
  })
  const deepSeekOnboardingInjected = (): DeepSeekOnboardingInjected => ({
    controller: page,
    hooks: { models: page.store },
    operations,
    schema,
    t,
  })
  const welcome = new WelcomeNoticeStore(forms.welcome)
  const welcomeInjected = (): WelcomeNoticeInjected => ({
    controller: welcome,
    hooks: { welcome: welcome.store },
    t,
  })

  controller.add(ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    label: () => locale.text('nav'),
    inject: injected,
    children: {
      'settings.models.provider-card': { kind: 'keyed', scope: 'root' },
      'settings.models.footer': { kind: 'list', scope: 'root' },
    },
  }, ModelsSection)))
  controller.add(ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'welcome-notice',
    order: -100,
    inject: welcomeInjected,
  }, WelcomeNotice)))
  controller.add(ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'deepseek-official',
    order: 0,
    inject: deepSeekOnboardingInjected,
  }, DeepSeekOnboardingDialog)))

  controller.add(() => welcome.dispose())
  if (remote !== undefined) {
    controller.add(remote.$on('settings/document-updated', () => {
      refreshIfLoaded(page)
    }))
    controller.add(remote.$on('credentials/reference-updated', () => {
      refreshIfLoaded(page)
    }))
    controller.add(remote.$on('llm/adapters-updated', () => {
      refreshIfLoaded(page)
    }))
  }
  controller.add(ctx.on('connection/reset', () => {
    refreshIfLoaded(page)
  }))
})
