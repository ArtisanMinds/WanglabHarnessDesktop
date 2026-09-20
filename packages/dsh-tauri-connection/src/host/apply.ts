import type { HostContext } from 'dsh-tauri'
import type { ConnectionHost } from './types'
import { PLUGIN_ID } from '../shared/constants'
import { clearHostRuntime, setCurrentHostInstance } from './config/runtime'
import { gate } from './service/gate'

export function apply(ctx: HostContext): void {
  setCurrentHostInstance(ctx as unknown as ConnectionHost)

  ctx.effect(() => gate.attach(), `${PLUGIN_ID}: gate`)
  ctx.effect(() => () => clearHostRuntime(), `${PLUGIN_ID}: host runtime`)
}
