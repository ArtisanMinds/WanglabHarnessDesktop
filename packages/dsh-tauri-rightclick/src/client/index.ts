import type { ClientContext } from 'dsh-tauri/client'
import { CONTEXT_MENU_EFFECT, LOCALE_EFFECT, PLUGIN_ID, STYLES_EFFECT } from './constants'
import { locale } from './locales'
import { contextMenuFeature } from './register/context-menu'
import { stylesFeature } from './register/styles'

export const name = PLUGIN_ID

export const inject = ['locale', 'sessions', 'workspaces']

export function apply(ctx: ClientContext): void {
  ctx.effect(locale.registerLocale, LOCALE_EFFECT)
  ctx.effect(stylesFeature, STYLES_EFFECT)
  ctx.effect(contextMenuFeature, CONTEXT_MENU_EFFECT)
}
