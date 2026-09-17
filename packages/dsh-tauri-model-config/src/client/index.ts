import type { ClientContext } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../shared/constants'
import { LOCALE_EFFECT, MODELS_PAGE_EFFECT, STYLES_EFFECT } from './constants'
import { locale } from './locales'
import { registerModelsPage } from './register/models'
import { registerStyles } from './register/styles'

export const name = PLUGIN_ID

export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.credentials',
  'remote.llm',
  'remote.settings',
  'settingsScope',
  'settingsSchema',
]

export function apply(ctx: ClientContext): void {
  ctx.effect(locale.registerLocale, LOCALE_EFFECT)
  ctx.effect(registerStyles, STYLES_EFFECT)
  ctx.effect(registerModelsPage, MODELS_PAGE_EFFECT)
}
