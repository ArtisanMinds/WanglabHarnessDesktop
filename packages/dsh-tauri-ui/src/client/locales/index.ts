import { defineLocale } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'

export const locale = defineLocale(PLUGIN_ID, {
  zh: {
    back: '返回应用',
    search: '搜索设置…',
    settings: '设置',
    noResults: '没有匹配的设置项',
    resumeTask: '继续任务',
    im: 'IM',
  },
  en: {
    back: 'Back to app',
    search: 'Search settings…',
    settings: 'Settings',
    noResults: 'No matching settings',
    resumeTask: 'Resume task',
    im: 'IM',
  },
})
