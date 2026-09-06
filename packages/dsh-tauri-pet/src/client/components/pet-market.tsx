import type { ReactElement } from 'react'
import type { MarketPetItem, PetMarketProps, PresetDownloadProgress } from '../types'
import { useEffect, useRef, useState } from 'react'
import { If } from 'react-if-lite'
import { usePetLocale } from '../locales'
import { createPetMarketSession, initialMarketSnapshot } from '../service/market'
import { progressPercent } from '../utils/preset-card'
import { IconImport, IconRefresh } from './icons'

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
  const percent = progress ? progressPercent(progress) : null

  return (
    <article className="dshpet-marketCard" aria-label={pet.name}>
      <div className="dshpet-marketPreview">
        <If cond={!imageFailed} else={<span>{pet.name}</span>}>
          <img src={pet.previewUrl} alt={pet.name} onError={() => setImageFailed(true)} loading="lazy" />
        </If>
      </div>
      <div className="dshpet-marketBody">
        <h3>{pet.name}</h3>
        <span className="dshpet-marketAuthor">{pet.author.name}</span>
        <div className="dshpet-marketMeta">
          <span>
            {(pet.size / 1024 / 1024).toFixed(1)}
            {' '}
            MB
          </span>
        </div>
        <button
          type="button"
          className={active ? 'dshpet-cardAction dshpet-cardActionActive' : 'dshpet-cardAction'}
          disabled={busy || active || downloading}
          onClick={pet.installed ? onChoose : onDownload}
        >
          <If cond={!pet.installed && !downloading}>
            <If cond={failed} then={<IconRefresh />} else={<IconImport />} />
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
          <progress className="dshpet-marketProgress" aria-label={messages.downloading} max={100} value={percent ?? undefined} />
        </If>
        <If cond={failed}>
          <p className="dshpet-error" role="alert">{messages[progress?.error?.includes('MISMATCH') ? 'downloadInvalid' : 'downloadFailed']}</p>
        </If>
      </div>
    </article>
  )
}

export function PetMarket(props: PetMarketProps): ReactElement {
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
    <section className="dshpet-market" aria-label={messages.market}>
      <div className="dshpet-marketTools">
        <div className="dshpet-tabTools">
          <button type="button" className="dshpet-toolBtn dshpet-toolIcon" disabled={snapshot.loading} onClick={() => { void sessionRef.current?.refresh() }} aria-label={messages.refresh} title={messages.refresh}><IconRefresh /></button>
        </div>
      </div>
      <If cond={Boolean(snapshot.error)}>
        <div className="dshpet-marketError" role="alert">
          <span>{messages.marketFailed}</span>
          <button type="button" className="dshpet-toolBtn" disabled={snapshot.loading} onClick={() => { void sessionRef.current?.refresh() }}>
            <IconRefresh />
            {messages.retry}
          </button>
        </div>
      </If>
      <If cond={snapshot.loading && snapshot.pets.length === 0}>
        <p className="dshpet-loading" role="status">{messages.loading}</p>
      </If>
      <If cond={!snapshot.loading && !snapshot.error && snapshot.pets.length === 0}>
        <p className="dshpet-empty">{messages.marketEmpty}</p>
      </If>
      <div className="dshpet-marketGrid">
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
