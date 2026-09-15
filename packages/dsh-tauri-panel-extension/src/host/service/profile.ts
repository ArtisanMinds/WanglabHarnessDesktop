/** Profile discovery (pure reads; same contract as dsh-plugin-install). */

import process from 'node:process'
import { DSH_HOME } from 'dsh-tauri'
import { join } from 'pathe'

/** Profile that boots this UI: `--profile <name>` on the CLI invocation. */
export function argvProfile(argv: readonly string[] = process.argv): string | undefined {
  const flag = argv.indexOf('--profile')
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith('-'))
    return argv[flag + 1]
  return undefined
}

/** Directory of a profile under DSH_HOME（数据根一律引用核心的 DSH_HOME）。 */
export function profileDir(profile: string): string {
  return join(DSH_HOME, 'profiles', profile)
}
