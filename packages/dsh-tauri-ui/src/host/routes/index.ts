import { defineRoutes } from 'dsh-tauri'
import resume from './session/resume/post'

export const routes = defineRoutes((disposer) => {
  disposer.post({ kind: 'exact', path: '/api/desktop/dsh-tauri-ui/session/resume' }, resume)
})
