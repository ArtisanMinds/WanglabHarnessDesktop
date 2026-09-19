import type { PetRef, PetRenderMotion } from 'dsh-pet-component'
import { useEventListener, useTimeoutFn, useWatch } from '@reause/core'
import { Pet, useControllablePet } from 'dsh-pet-component'
import { useRef } from 'react'
import { If } from 'react-if-lite'
import { useOmitIgnoreCursorEvents } from '@/hooks/use-omit-ignore-cursor-events'
import { useWindowDraggable } from '@/hooks/use-window-draggable'
import { Hint } from '@/ui/pet/hint'
import { useWakelockRelease } from '../hooks/use-wakelock-release'
import { PET_BASE_WIDTH, PET_DSH_ASPECT } from './constants'
import { useBubbleTracker } from './hooks/use-bubble-tracker'
import { usePetSource } from './hooks/use-pet-source'
import { normalizeSizePercent, usePetStatus } from './hooks/use-pet-status'
import { usePetWindowSize } from './hooks/use-pet-window'
import { reportPetRender } from './pet-runtime'
import { reportPetIssue } from './utils/log'

export function App() {
  const petRef = useRef<PetRef>(null)
  const pet = useControllablePet(petRef)
  const status = usePetStatus()

  const activePet = status?.active_pet ?? ''
  const renderId = status?.render_id ?? 0
  const { source, error } = usePetSource(activePet, renderId)
  const hitboxRef = useRef<HTMLDivElement>(null)
  const draggable = useWindowDraggable()

  const visible = Boolean(activePet && status?.enabled && status.visible)
  const mediaTimeout = useTimeoutFn(() => {
    reportPetRender({ active_pet: activePet, render_id: renderId }, 'PET_MEDIA_TIMEOUT: pet media did not become ready within 15 seconds')
  }, 15000, { immediate: false })
  useWatch([activePet, renderId, visible, status?.ready], () => {
    if (visible && !status?.ready)
      mediaTimeout.start()
    else
      mediaTimeout.stop()
  }, { immediate: true })
  useWatch([error, renderId], () => {
    if (error)
      reportPetRender({ active_pet: activePet, render_id: renderId }, error)
  }, { immediate: true })
  const width = (source?.width ?? PET_BASE_WIDTH) * normalizeSizePercent(status?.pet_size) / 100

  useBubbleTracker(pet, source)
  usePetWindowSize(width, source?.aspect ?? PET_DSH_ASPECT, visible)
  useOmitIgnoreCursorEvents(hitboxRef)
  useEventListener('contextmenu', event => event.preventDefault())
  useWakelockRelease()

  function reportPetAssetError(error: unknown) {
    reportPetIssue('asset', error)
    reportPetRender({ active_pet: activePet, render_id: renderId }, 'PET_MEDIA_DECODE_FAILED: failed to load pet media')
  }

  const motion: PetRenderMotion | undefined = draggable.dragging
    ? (draggable.direction === undefined ? undefined : `moving-${draggable.direction}`)
    : undefined

  return (
    <main className={`pointer-events-none fixed inset-0 flex items-end justify-center ${visible ? '' : 'invisible'}`}>
      {source && (
        <Pet
          key={`${activePet}:${renderId}`}
          ref={petRef}
          kind={source.kind}
          config={source.config}
          uri={source.uri}
          ext={source.ext}
          motion={source?.kind === 'codex' ? motion : undefined}
          size={width}
          dragging={draggable.dragging}
          cache={source.kind === 'dsh'}
          hidden={!visible}
          hitboxRef={hitboxRef}
          onReady={() => reportPetRender({ active_pet: activePet, render_id: renderId })}
          onError={reportPetAssetError}
        />
      )}
      <If cond={error !== null} then={<Hint petId={activePet} />} />
    </main>
  )
}
