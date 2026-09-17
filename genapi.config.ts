import { defineConfig } from '@genapi/core'
import { pluginPipeline } from './genapi.pipeline'

const plugins = [
  'dsh-tauri-model-config',
  'dsh-tauri-panel-extension',
  'dsh-tauri-panel-scheduler',
  'dsh-tauri-rightclick',
  'dsh-tauri-session',
  'dsh-tauri-turnrewind',
  'dsh-tauri-ui',
  'dsh-tauri-worktree',
]

export default defineConfig({
  preset: pluginPipeline,
  meta: { import: { http: 'dsh-tauri/client' } },
  // worktree 的根级 routes/post.ts、routes/delete.ts 生成名是 `post` / 保留字 `delete`
  patch: { operations: { delete: 'deleteWorktree', post: 'postWorktree' } },
  servers: plugins.map(plugin => ({
    input: `packages/${plugin}/src/host/routes`,
    output: { main: `packages/${plugin}/src/client/apis/index.ts` },
    meta: { baseURL: JSON.stringify(`/api/desktop/${plugin}`) },
  })),
})
