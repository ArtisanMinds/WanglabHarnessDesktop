import type { ConnectionHost } from '../types'
import { defineHostRuntime } from 'dsh-tauri'

export const { setCurrentHostInstance, getCurrentHostInstance } = defineHostRuntime<ConnectionHost>()

export function clearHostRuntime(): void {
  setCurrentHostInstance(undefined)
}
