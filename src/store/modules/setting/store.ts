import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'valtio-define'
import { persist } from 'valtio-define/plugins/persist'
import { storage } from '@/config/storage'

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
