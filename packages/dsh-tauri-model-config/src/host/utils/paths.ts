import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { SETTINGS_FILE_NAME } from '../../shared/constants'

function expandHome(path: string): string {
  if (path === '~')
    return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\'))
    return join(homedir(), path.slice(2))
  return path
}

/** `$DSH_HOME`（非空白）优先，否则 `~/.dsh`：与官方 `resolveDshHome` 及桌面壳保持一致。 */
export function resolveSettingsFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME
  const home = configured !== undefined && configured.trim().length > 0
    ? expandHome(configured)
    : join(homedir(), '.dsh')
  return join(resolve(home), SETTINGS_FILE_NAME)
}
