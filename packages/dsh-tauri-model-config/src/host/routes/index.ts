import { defineRoutes } from 'dsh-tauri'
import openConfig from './config/open/post'
import rapidMlxModels from './rapid-mlx/models/get'

export const routes = defineRoutes((disposer) => {
  disposer.get({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/rapid-mlx/models' }, rapidMlxModels)
  disposer.post({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/open' }, openConfig)
})
