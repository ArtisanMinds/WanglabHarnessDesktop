import { defineRoutes } from 'dsh-tauri'
import getEditor from './config/editor/get'
import putEditor from './config/editor/put'
import openConfig from './config/open/post'
import endpointModels from './endpoint/models/get'
import presets from './presets/get'

export const routes = defineRoutes((disposer) => {
  disposer.get({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/editor' }, getEditor)
  disposer.put({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/editor' }, putEditor)
  disposer.get({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/endpoint/models' }, endpointModels)
  disposer.get({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/presets' }, presets)
  disposer.post({ kind: 'exact', path: '/api/desktop/dsh-tauri-model-config/config/open' }, openConfig)
})
