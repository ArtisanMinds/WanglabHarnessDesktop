import { defineLocale } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'
import { en, zh } from '../models/locales'

/** 模型配置页的文案命名空间（沿用官方 `settings.models` 的键集）。 */
export const locale = defineLocale(PLUGIN_ID, { zh, en })
