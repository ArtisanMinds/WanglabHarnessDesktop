import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { PLUGIN_ID, SETTINGS_FILE_NAME } from '../../shared/constants'

const PRESET_CACHE_FILE_NAME = 'model-presets.json'

function expandHome(path: string): string {
  if (path === '~')
    return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\'))
    return join(homedir(), path.slice(2))
  return path
}

function resolveDshHome(env: NodeJS.ProcessEnv): string {
  const configured = env.DSH_HOME
  const home = configured !== undefined && configured.trim().length > 0
    ? expandHome(configured)
    : join(homedir(), '.dsh')
  return resolve(home)
}

/** `$DSH_HOME`（非空白）优先，否则 `~/.dsh`：与官方 `resolveDshHome` 及桌面壳保持一致。 */
export function resolveSettingsFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), SETTINGS_FILE_NAME)
}

/** 模型能力预设的磁盘缓存：`$DSH_HOME/dsh-tauri-model-config/model-presets.json`。 */
export function resolvePresetCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), PLUGIN_ID, PRESET_CACHE_FILE_NAME)
}
