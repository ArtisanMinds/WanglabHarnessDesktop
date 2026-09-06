import type { PetStatus } from '../types'

export function isPetStatus(value: unknown): value is PetStatus {
  if (!value || typeof value !== 'object')
    return false
  const status = value as Partial<PetStatus>
  return (status.active_pet === null || typeof status.active_pet === 'string')
    && typeof status.enabled === 'boolean'
    && typeof status.visible === 'boolean'
    && typeof status.ready === 'boolean'
    && (status.error === null || typeof status.error === 'string')
    && Number.isSafeInteger(status.render_id)
    && Number.isSafeInteger(status.revision)
}

export function isPetVisible(status: PetStatus | null): boolean {
  return Boolean(status?.active_pet && status.enabled && status.visible && status.ready && !status.error)
}
