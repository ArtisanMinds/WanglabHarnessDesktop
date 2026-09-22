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
  'settingsSchema',
]

/**
 * 设置命名空间服务跨内核代更名：≤0.1.6 是 `settingsScope`，≥0.1.7 是 `configForms`。
 * 两者都不能写进 `inject`——缺席的服务会让 fiber 永久 pending，直接导致另一代内核
 * 加载失败。因此各自独立等待，任意一代就绪即启动，且只启动一次。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(locale.registerLocale, LOCALE_EFFECT)
  ctx.effect(registerStyles, STYLES_EFFECT)
  let started = false
  const start = (): void => {
    if (started)
      return
    started = true
    ctx.effect(registerModelsPage, MODELS_PAGE_EFFECT)
  }
  ctx.inject(['configForms'], start)
  ctx.inject(['settingsScope'], start)
}
