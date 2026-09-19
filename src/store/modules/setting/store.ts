import type { AppSettingUpdate, ZoomAction } from './types'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'valtio-define'
import { persist } from 'valtio-define/plugins/persist'
import { storage } from '@/config/storage'
import { ZOOM_FACTOR_STEP } from './constants'
import { normalizeZoomFactor } from './utils'

export const setting = defineStore({
  state: () => ({
    installed: false,
    port: 3080,
    auto_start: true,
    cli_link_enabled: true,
    zoom_factor: 1,
    close_action: 'tray',
    backup_retention_count: 10,
    backup_include_credentials: false,
    language: null as string | null,
  }),
  actions: {
    update(update: AppSettingUpdate) {
      return invoke('update_app_config', { ...update })
    },
    zoom(action: ZoomAction) {
      if (action === 'reset') {
        this.zoom_factor = 1
        return
      }
      const delta = action === 'increase' ? ZOOM_FACTOR_STEP : -ZOOM_FACTOR_STEP
      this.zoom_factor = normalizeZoomFactor(this.zoom_factor + delta)
    },
  },
  persist: {
    key: 'setting',
    storage,
    paths: ['zoom_factor', 'language'],
  },
})

setting.use(persist({ hydrate: false }))

const unlisten = listen('setting_updated', async () => {
  await setting.$persist.rehydrate()
})

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    (await unlisten)()
    setting.$persist.dehydrate()
  })
}
