import type { ChangeEvent, ReactElement } from 'react'
import type { PetSettingsProps } from './pet-settings.types'
import { ArrowDownToLine, Button, Icon, Plus, SegmentedControl } from 'dsh-tauri-ui/client'
import { useStore, useWatchImmediate } from 'dsh-tauri/client'
import { useEffect, useId, useRef, useState } from 'react'
import { If } from 'react-if-lite'
import { PET_DEFAULT_SIZE, PET_SIZE_MAX, PET_SIZE_MIN, PET_SIZE_STEP } from '../constants'
import { locale } from '../locales'
import {
  clearPetSelection,
  enablePet,
  importPetArchive,
  loadPetCatalog,
  resizePet,
  togglePet,
} from '../service/pet'
import { store } from '../store'
import { PetCard } from './pet-card'
import { PetMarket } from './pet-market'

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(new Error('PET_FILE_READ_FAILED: failed to read pet archive'))
    reader.readAsDataURL(file)
  })
}

function spriteType(thumbnail?: string): 'spritesheet' | undefined {
  if (thumbnail)
    return 'spritesheet'
  return undefined
}

export function PetSettings(props: PetSettingsProps): ReactElement {
  locale.useLocale()
  const { status, presetPets, chatPets, catalogLoaded } = useStore(store.pet)
  const [tab, setTab] = useState<'pets' | 'market'>('pets')
  const [marketOpened, setMarketOpened] = useState(false)
  const [busy, setBusy] = useState(() => !catalogLoaded)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState(status?.pet_size ?? PET_DEFAULT_SIZE)
  const tabsId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const committedSizeRef = useRef<number | null>(null)
  const visible = Boolean(status?.enabled && status.visible)
  const active = status?.active_pet ?? ''
  const statusSize = status?.pet_size ?? PET_DEFAULT_SIZE
  const displayError = error ?? (status?.error ? `${locale.text('loadFailed')}: ${status.error}` : null)
  const tabOptions = [
    { value: 'pets', label: locale.text('name') },
    { value: 'market', label: locale.text('market') },
  ] as const

  useWatchImmediate(statusSize, () => {
    if (statusSize !== committedSizeRef.current)
      setSize(statusSize)
  })

  // keep:effect 关闭面板后忽略尚未完成的清单请求。
  useEffect(() => {
    let cancelled = false
    void loadPetCatalog().then((result) => {
      if (cancelled)
        return
      setBusy(false)
      if (!result.ok)
        setError(locale.text('listFailed'))
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function choose(id: string): Promise<void> {
    if (busy || active === id)
      return
    setBusy(true)
    setError(null)
    const result = await enablePet({ id })
    if (!result.ok)
      setError(locale.text('setPetFailed'))
    setBusy(false)
  }

  async function clearSelection(): Promise<void> {
    if (busy || active === '')
      return
    setBusy(true)
    setError(null)
    const result = await clearPetSelection()
    if (!result.ok)
      setError(locale.text('clearFailed'))
    setBusy(false)
  }

  async function toggleEnabled(): Promise<void> {
    if (busy || !active)
      return
    setBusy(true)
    setError(null)
    const result = await togglePet({ enabled: !visible })
    if (!result.ok)
      setError(locale.text('toggleFailed'))
    setBusy(false)
  }

  async function commitSize(value: number): Promise<void> {
    setError(null)
    const result = await resizePet({ size: value })
    if (result.ok)
      committedSizeRef.current = value
    else
      setError(locale.text('setSizeFailed'))
  }

  async function createPet(): Promise<void> {
    if (busy)
      return
    setBusy(true)
    setError(null)
    const result = await props.onCreate(props.close)
    if (!result.ok) {
      setError(locale.text('createFailed'))
      setBusy(false)
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy)
      return
    setBusy(true)
    setError(null)
    try {
      const result = await importPetArchive({ name: file.name, data: await readAsBase64(file) })
      if (!result.ok)
        setError(locale.text('importFailed'))
    }
    catch (importError) {
      console.error('[dsh-tauri-pet] import failed:', importError)
      setError(locale.text('importFailed'))
    }
    finally {
      setBusy(false)
    }
  }

  async function refreshPets(): Promise<void> {
    const result = await loadPetCatalog()
    if (!result.ok)
      throw new Error(result.error)
  }

  function actionLabel(selected: boolean, fallback: 'enable' | 'select'): string {
    if (selected)
      return locale.text('clear')
    return locale.text(fallback)
  }

  function runPetAction(selected: boolean, id: string): void {
    if (selected) {
      void clearSelection()
      return
    }
    void choose(id)
  }

  function selectTab(next: string): void {
    if (next === 'market') {
      setMarketOpened(true)
      setTab('market')
      return
    }
    setTab('pets')
  }

  const petsPanel = (
    <If
      cond={busy && presetPets.length === 0 && chatPets.length === 0}
      else={(
        <div className="dshp-pet__cards">
          {presetPets.map((item) => {
            const selected = active === item.id
            return (
              <PetCard
                key={item.id}
                thumbnail={item.image ?? undefined}
                name={item.name}
                desc={item.desc ?? ''}
                active={selected}
                disabled={busy}
                actionLabel={actionLabel(selected, 'enable')}
                onAction={() => runPetAction(selected, item.id)}
              />
            )
          })}
          {chatPets.map((item) => {
            const selected = active === item.id
            return (
              <PetCard
                key={item.id}
                thumbnail={item.thumbnail}
                thumbnailType={spriteType(item.thumbnail)}
                spriteRows={item.sprite_rows}
                name={item.name}
                desc={item.description ?? ''}
                active={selected}
                disabled={busy}
                actionLabel={actionLabel(selected, 'select')}
                onAction={() => runPetAction(selected, item.id)}
              />
            )
          })}
          <If cond={presetPets.length === 0 && chatPets.length === 0}>
            <div className="dshp-pet__empty">{locale.text('emptyPets')}</div>
          </If>
        </div>
      )}
    >
      <div className="dshp-pet__loading">{locale.text('loading')}</div>
    </If>
  )

  return (
    <div className="dshp-pet__page">
      <div className="dshp-pet__tabs">
        <SegmentedControl
          id={tabsId}
          label={locale.text('name')}
          value={tab}
          options={tabOptions}
          onChange={selectTab}
        />
        <div className="dshp-pet__tab-tools">
          <If cond={tab === 'pets'}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Icon as={Plus} />}
              disabled={busy}
              onClick={() => { void createPet() }}
            >
              {locale.text('create')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Icon as={ArrowDownToLine} />}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {locale.text('import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              hidden
              disabled={busy}
              onChange={(event) => { void onImport(event) }}
            />
          </If>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !active}
            onClick={() => { void toggleEnabled() }}
          >
            <If cond={visible} then={locale.text('closePet')} else={locale.text('wakePet')} />
          </Button>
        </div>
      </div>
      <div id={`${tabsId}-pets-panel`} role="tabpanel" aria-labelledby={`${tabsId}-pets`} hidden={tab !== 'pets'}>
        {petsPanel}
      </div>
      <div id={`${tabsId}-market-panel`} role="tabpanel" aria-labelledby={`${tabsId}-market`} hidden={tab !== 'market'}>
        <If cond={marketOpened}>
          <PetMarket active={active} busy={busy} onChoose={choose} onInstalled={refreshPets} />
        </If>
      </div>
      <If cond={Boolean(displayError)}>
        <div className="dshp-pet__error" role="alert">{displayError}</div>
      </If>
      <If cond={tab === 'pets'}>
        <div className="dshp-pet__size-row">
          <span className="dshp-pet__size-label">{locale.text('sizeLabel')}</span>
          <input
            type="range"
            className="dshp-pet__size-slider"
            min={PET_SIZE_MIN}
            max={PET_SIZE_MAX}
            step={PET_SIZE_STEP}
            value={size}
            aria-label={locale.text('sizeLabel')}
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
