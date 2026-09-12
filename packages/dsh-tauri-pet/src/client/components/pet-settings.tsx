import type { ChangeEvent, ReactElement } from 'react'
import type { PetListItem, PetSettingsProps, PresetPetItem } from '../types'
import { ArrowDownToLine, Icon, Plus, useMountStyle } from 'dsh-tauri-ui/client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { If } from 'react-if-lite'
import { PET_DEFAULT_SIZE, PET_SIZE_MAX, PET_SIZE_MIN, PET_SIZE_STEP } from '../constants'
import { text, usePetLocale } from '../locales'
import { activatePet, fetchPetList, fetchPetStatus, fetchPresetPets, importPet, setActivePet, setPetEnabled, setPetSize } from '../service/pet'
import { beginPetStatusFetch, commitPetStatusFetch, getPetUiSnapshot, setPetsAvailable, setPetStatus, subscribePetUi } from '../store'
import { hasAvailablePets } from '../utils/availability'
import { PetMarket } from './pet-market'
import petSettingsStyle from './pet-settings.cssr'

let cachedPresetPets: PresetPetItem[] | null = null
let cachedChatPets: PetListItem[] | null = null

interface PetCardProps {
  actionLabel: string
  active: boolean
  desc: string
  disabled: boolean
  name: string
  onAction: () => void
  thumbnail?: string
  spriteRows?: number | null
}

function PetCard(props: PetCardProps): ReactElement {
  return (
    <div className="dshp-pet__card-item">
      <If cond={!!props.thumbnail} else={<div className="dshp-pet__card-thumb dshp-pet__card-thumbPlaceholder" aria-hidden="true">PET</div>}>
        <If cond={props.spriteRows != null} else={<img className="dshp-pet__card-thumb" src={props.thumbnail} alt="" aria-hidden="true" />}>
          <span className="dshp-pet__card-thumb dshp-pet__card-thumbSprite" data-sprite-rows={props.spriteRows ?? 11} aria-hidden="true">
            <img src={props.thumbnail} alt="" aria-hidden="true" />
          </span>
        </If>
      </If>
      <span className="dshp-pet__card-body">
        <span className="dshp-pet__card-nameRow"><span className="dshp-pet__card-name">{props.name}</span></span>
        <If cond={!!props.desc}><span className="dshp-pet__card-desc">{props.desc}</span></If>
      </span>
      <span className="dshp-pet__card-actions">
        <button
          type="button"
          className={props.active ? 'dshp-pet__card-action dshp-pet__card-actionActive' : 'dshp-pet__card-action'}
          disabled={props.disabled}
          onClick={props.onAction}
        >
          {props.actionLabel}
        </button>
      </span>
    </div>
  )
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('PET_FILE_READ_FAILED: failed to read pet archive'))
    reader.readAsDataURL(file)
  })
}

export function PetSettings(props: PetSettingsProps): ReactElement {
  useMountStyle(petSettingsStyle, 'dsh-tauri-pet-settings-styles')
  const messages = usePetLocale()
  const { status } = useSyncExternalStore(subscribePetUi, getPetUiSnapshot, getPetUiSnapshot)
  const [tab, setTab] = useState<'pets' | 'market'>('pets')
  const [marketOpened, setMarketOpened] = useState(false)
  const [busy, setBusy] = useState(() => cachedChatPets === null)
  const [error, setError] = useState<string | null>(null)
  const [chatPets, setChatPets] = useState<PetListItem[]>(() => cachedChatPets ?? [])
  const [presetPets, setPresetPets] = useState<PresetPetItem[]>(() => cachedPresetPets ?? [])
  const [size, setSize] = useState(status?.pet_size ?? PET_DEFAULT_SIZE)
  const committedSizeRef = useRef<number | null>(null)
  const active = status?.active_pet ?? null
  const visible = Boolean(status?.enabled && status.visible)
  const displayError = error ?? (status?.error ? `${messages.loadFailed}: ${status.error}` : null)
  const statusSize = status?.pet_size ?? PET_DEFAULT_SIZE

  useEffect(() => {
    if (statusSize !== committedSizeRef.current)
      setSize(statusSize)
  }, [statusSize])

  useEffect(() => {
    let cancelled = false
    const revision = beginPetStatusFetch()
    void Promise.all([fetchPetStatus(), fetchPetList(), fetchPresetPets()])
      .then(([nextStatus, nextChatPets, nextPresetPets]) => {
        if (cancelled)
          return
        commitPetStatusFetch(revision, nextStatus)
        cachedChatPets = nextChatPets
        cachedPresetPets = nextPresetPets
        setChatPets(nextChatPets)
        setPresetPets(nextPresetPets)
        setPetsAvailable(hasAvailablePets(nextPresetPets, nextChatPets))
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error('[dsh-tauri-pet] initial load failed:', loadError)
          setError(text('listFailed'))
        }
      })
      .finally(() => {
        if (!cancelled)
          setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(id: string): Promise<void> {
    if (busy)
      return
    setBusy(true)
    setError(null)
    try {
      setPetStatus(id === active ? await setActivePet('') : await activatePet(id))
    }
    catch (chooseError) {
      setError(`${text('setPetFailed')}: ${String(chooseError)}`)
    }
    finally {
      setBusy(false)
    }
  }

  async function toggleEnabled(): Promise<void> {
    if (busy || !active)
      return
    setBusy(true)
    setError(null)
    try {
      setPetStatus(await setPetEnabled(!visible))
    }
    catch (toggleError) {
      setError(`${text('toggleFailed')}: ${String(toggleError)}`)
    }
    finally {
      setBusy(false)
    }
  }

  async function commitSize(value: number): Promise<void> {
    setError(null)
    try {
      const nextStatus = await setPetSize(value)
      committedSizeRef.current = value
      setPetStatus(nextStatus)
    }
    catch {
      setError(text('setSizeFailed'))
    }
  }

  async function createPet(): Promise<void> {
    if (busy)
      return
    setBusy(true)
    setError(null)
    try {
      await props.onCreate(props.close)
    }
    catch {
      setError(text('createFailed'))
      setBusy(false)
    }
  }

  async function refreshChatPets(): Promise<void> {
    const pets = await fetchPetList()
    cachedChatPets = pets
    setChatPets(pets)
    setPetsAvailable(hasAvailablePets(cachedPresetPets ?? [], pets))
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy)
      return
    setBusy(true)
    setError(null)
    try {
      await importPet(file.name, await readAsBase64(file))
      await refreshChatPets()
    }
    catch (importError) {
      setError(`${text('importFailed')}: ${String(importError)}`)
    }
    finally {
      setBusy(false)
    }
  }

  const empty = presetPets.length === 0 && chatPets.length === 0
  return (
    <div className="dshp-pet__page">
      <div className="dshp-pet__tabs">
        <div className="dshp-pet__tab-list" role="tablist" aria-label={messages.name}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pets'}
            className={tab === 'pets' ? 'dshp-pet__tab-btn dshp-pet__tab-btnActive' : 'dshp-pet__tab-btn'}
            onClick={() => setTab('pets')}
          >
            {messages.name}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'market'}
            className={tab === 'market' ? 'dshp-pet__tab-btn dshp-pet__tab-btnActive' : 'dshp-pet__tab-btn'}
            onClick={() => {
              setMarketOpened(true)
              setTab('market')
            }}
          >
            {messages.market}
          </button>
        </div>
        <div className="dshp-pet__tab-tools">
          <If cond={tab === 'pets'}>
            <button type="button" className="dshp-pet__tool-btn" disabled={busy} onClick={() => { void createPet() }}>
              <Icon as={Plus} />
              {messages.create}
            </button>
            <label className="dshp-pet__tool-btn" aria-disabled={busy}>
              <Icon as={ArrowDownToLine} />
              {messages.import}
              <input type="file" accept=".zip" hidden disabled={busy} onChange={(event) => { void onImport(event) }} />
            </label>
          </If>
          <button type="button" className="dshp-pet__tool-btn" disabled={busy || !active} onClick={() => { void toggleEnabled() }}>
            {visible ? messages.closePet : messages.wakePet}
          </button>
        </div>
      </div>
      <If cond={tab === 'pets'}>
        <If
          cond={busy && empty}
          else={(
            <div className="dshp-pet__cards">
              {presetPets.map(item => (
                <PetCard
                  key={item.id}
                  thumbnail={item.image ?? undefined}
                  name={item.name}
                  desc={item.desc ?? ''}
                  active={active === item.id}
                  disabled={busy}
                  actionLabel={active === item.id ? messages.clear : messages.enable}
                  onAction={() => { void choose(item.id) }}
                />
              ))}
              {chatPets.map(item => (
                <PetCard
                  key={item.id}
                  thumbnail={item.thumbnail}
                  spriteRows={item.sprite_rows}
                  name={item.name}
                  desc={item.description ?? ''}
                  active={active === item.id}
                  disabled={busy}
                  actionLabel={active === item.id ? messages.clear : messages.select}
                  onAction={() => { void choose(item.id) }}
                />
              ))}
              <If cond={empty}><div className="dshp-pet__empty">{messages.emptyPets}</div></If>
            </div>
          )}
        >
          <div className="dshp-pet__loading">{messages.loading}</div>
        </If>
      </If>
      <If cond={marketOpened}>
        <div hidden={tab !== 'market'}>
          <PetMarket active={active} busy={busy} onChoose={choose} onInstalled={refreshChatPets} />
        </div>
      </If>
      <If cond={!!displayError}><div className="dshp-pet__error" role="alert">{displayError}</div></If>
      <If cond={tab === 'pets'}>
        <div className="dshp-pet__size-row">
          <span className="dshp-pet__size-label">{messages.sizeLabel}</span>
          <input
            type="range"
            className="dshp-pet__size-slider"
            min={PET_SIZE_MIN}
            max={PET_SIZE_MAX}
            step={PET_SIZE_STEP}
            value={size}
            aria-label={messages.sizeLabel}
            onChange={(event) => {
              const value = Number(event.target.value)
              setSize(value)
              void commitSize(value)
            }}
          />
          <span className="dshp-pet__size-value">
            {size}
            %
          </span>
        </div>
      </If>
    </div>
  )
}
