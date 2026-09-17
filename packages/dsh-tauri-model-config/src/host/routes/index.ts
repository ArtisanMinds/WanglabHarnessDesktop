import { defineRoutes } from 'dsh-tauri'
import openConfig from './config/open/post'

export const routes = defineRoutes((disposer) => {
  disposer.post({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/open' }, openConfig)
})
