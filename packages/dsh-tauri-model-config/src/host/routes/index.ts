import { defineRoutes } from 'dsh-tauri'
import openConfig from './config/open/post'
import endpointModels from './endpoint/models/get'

export const routes = defineRoutes((disposer) => {
  disposer.get({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/endpoint/models' }, endpointModels)
  disposer.post({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/open' }, openConfig)
})
