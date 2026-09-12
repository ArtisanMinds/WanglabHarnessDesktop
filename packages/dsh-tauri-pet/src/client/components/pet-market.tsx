import type { ReactElement } from 'react'
import type { MarketPetItem, PetMarketProps, PresetDownloadProgress } from '../types'
import { ArrowDownToLine, ArrowRotateRight, Icon, useMountStyle } from 'dsh-tauri-ui/client'
import { useEffect, useRef, useState } from 'react'
import { If } from 'react-if-lite'
import { usePetLocale } from '../locales'
import { createPetMarketSession, initialMarketSnapshot } from '../service/market'
import petMarketStyle from './pet-market.cssr'

interface MarketCardProps {
  pet: MarketPetItem
  active: boolean
  busy: boolean
  progress?: PresetDownloadProgress
  onDownload: () => void
  onChoose: () => void
}

function MarketCard({ pet, active, busy, progress, onDownload, onChoose }: MarketCardProps): ReactElement {
  const messages = usePetLocale()
  const [imageFailed, setImageFailed] = useState(false)
  const phase = progress?.phase ?? pet.phase
  const downloading = phase === 'downloading' || phase === 'extracting'
  const failed = phase === 'failed'
  const label = active ? 'selected' : pet.installed ? 'enable' : downloading ? 'downloading' : failed ? 'retry' : 'download'
  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round(progress.received / progress.total * 100))
    : null

  return (
    <article className="dshp-pet__market-card" aria-label={pet.name}>
      <div className="dshp-pet__market-preview">
        <If cond={!imageFailed} else={<span>{pet.name}</span>}>
          <img src={pet.previewUrl} alt={pet.name} onError={() => setImageFailed(true)} loading="lazy" />
        </If>
      </div>
      <div className="dshp-pet__market-body">
        <h3>{pet.name}</h3>
        <span className="dshp-pet__market-author">{pet.author.name}</span>
        <div className="dshp-pet__market-meta">
          <span>
            {(pet.size / 1024 / 1024).toFixed(1)}
            {' '}
            MB
          </span>
        </div>
        <button
          type="button"
          className={active ? 'dshp-pet__card-action dshp-pet__card-actionActive' : 'dshp-pet__card-action'}
          disabled={busy || active || downloading}
          onClick={pet.installed ? onChoose : onDownload}
        >
          <If cond={!pet.installed && !downloading}>
            <If cond={failed} then={<Icon as={ArrowRotateRight} />} else={<Icon as={ArrowDownToLine} />} />
          </If>
          {messages[label]}
          <If cond={downloading && percent !== null}>
            <span>
              {percent}
              %
            </span>
          </If>
        </button>
        <If cond={downloading}>
          <progress className="dshp-pet__market-progress" aria-label={messages.downloading} max={100} value={percent ?? undefined} />
        </If>
        <If cond={failed}>
          <p className="dshp-pet__error" role="alert">{messages[progress?.error?.includes('MISMATCH') ? 'downloadInvalid' : 'downloadFailed']}</p>
        </If>
      </div>
    </article>
  )
}

export function PetMarket(props: PetMarketProps): ReactElement {
  useMountStyle(petMarketStyle, 'dsh-tauri-pet-market-styles')
  const messages = usePetLocale()
  const [snapshot, setSnapshot] = useState(initialMarketSnapshot)
  const sessionRef = useRef<ReturnType<typeof createPetMarketSession> | null>(null)
  const onInstalledRef = useRef(props.onInstalled)

  useEffect(() => {
    onInstalledRef.current = props.onInstalled
  }, [props.onInstalled])
  useEffect(() => {
    const current = createPetMarketSession(setSnapshot, () => onInstalledRef.current())
    sessionRef.current = current
    void current.refresh(false)
    return () => {
      current.dispose()
      sessionRef.current = null
    }
  }, [])

  return (
    <section className="dshp-pet__market" aria-label={messages.market}>
      <div className="dshp-pet__market-tools">
        <div className="dshp-pet__tab-tools">
          <button type="button" className="dshp-pet__tool-btn dshp-pet__tool-icon" disabled={snapshot.loading} onClick={() => { void sessionRef.current?.refresh() }} aria-label={messages.refresh} title={messages.refresh}><Icon as={ArrowRotateRight} /></button>
        </div>
      </div>
      <If cond={Boolean(snapshot.error)}>
        <div className="dshp-pet__market-error" role="alert">
          <span>{messages.marketFailed}</span>
          <button type="button" className="dshp-pet__tool-btn" disabled={snapshot.loading} onClick={() => { void sessionRef.current?.refresh() }}>
            <Icon as={ArrowRotateRight} />
            {messages.retry}
          </button>
        </div>
      </If>
      <If cond={snapshot.loading && snapshot.pets.length === 0}>
        <p className="dshp-pet__loading" role="status">{messages.loading}</p>
      </If>
      <If cond={!snapshot.loading && !snapshot.error && snapshot.pets.length === 0}>
        <p className="dshp-pet__empty">{messages.marketEmpty}</p>
      </If>
      <div className="dshp-pet__market-grid">
        {snapshot.pets.map(pet => (
          <MarketCard
            key={pet.id}
            pet={pet}
            active={pet.installed && props.active === `chat:${pet.id}`}
            busy={props.busy}
            progress={snapshot.downloads[pet.id]}
            onDownload={() => { void sessionRef.current?.download(pet.id) }}
            onChoose={() => { void props.onChoose(`chat:${pet.id}`) }}
          />
        ))}
      </div>
    </section>
  )
}
