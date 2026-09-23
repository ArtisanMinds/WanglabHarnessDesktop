import type { ReactElement } from 'react'
import type { MarketPetItem, PetMarketProps, PresetDownloadProgress } from '../types/market'
import { ArrowDownToLine, ArrowRotateRight, Button, Icon, IconButton } from 'dsh-tauri-ui/client'
import { useWatchImmediate } from 'dsh-tauri/client'
import { useEffect, useRef, useState } from 'react'
import { If } from 'react-if-lite'
import { locale } from '../locales'
import { createPetMarketSession, initialMarketSnapshot } from '../register/market'

interface MarketCardProps {
  pet: MarketPetItem
  active: boolean
  busy: boolean
  progress?: PresetDownloadProgress
  onDownload: () => void
  onChoose: () => void
}

function MarketCard({ pet, active, busy, progress, onDownload, onChoose }: MarketCardProps): ReactElement {
  locale.useLocale()
  const [imageFailed, setImageFailed] = useState(false)
  const phase = progress?.phase ?? pet.phase
  const downloading = phase === 'downloading' || phase === 'extracting'
  const failed = phase === 'failed'
  const label = active ? 'selected' : pet.installed ? 'enable' : downloading ? 'downloading' : failed ? 'retry' : 'download'
  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round(progress.received / progress.total * 100))
    : null
  const actionIcon = !pet.installed && !downloading
    ? <Icon as={failed ? ArrowRotateRight : ArrowDownToLine} />
    : undefined

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
        <Button
          type="button"
          variant={active ? 'primary' : 'outline'}
          size="sm"
          icon={actionIcon}
          disabled={busy || active || downloading}
          onClick={pet.installed ? onChoose : onDownload}
        >
          {locale.text(label)}
          <If cond={downloading && percent !== null}>
            <span>
              {percent}
              %
            </span>
          </If>
        </Button>
        <If cond={downloading}>
          <progress className="dshp-pet__market-progress" aria-label={locale.text('downloading')} max={100} value={percent ?? undefined} />
        </If>
        <If cond={failed}>
          <p className="dshp-pet__error" role="alert">{locale.text(progress?.error?.includes('MISMATCH') ? 'downloadInvalid' : 'downloadFailed')}</p>
        </If>
      </div>
    </article>
  )
}

export function PetMarket(props: PetMarketProps): ReactElement {
  locale.useLocale()
  const [snapshot, setSnapshot] = useState(initialMarketSnapshot)
  const sessionRef = useRef<ReturnType<typeof createPetMarketSession> | null>(null)
  const onInstalledRef = useRef(props.onInstalled)

  useWatchImmediate(props.onInstalled, () => {
    onInstalledRef.current = props.onInstalled
  })
  // keep:effect 关闭市场后停止轮询，下载由后端继续。
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
    <section className="dshp-pet__market" aria-label={locale.text('market')}>
      <div className="dshp-pet__market-tools">
        <div className="dshp-pet__tab-tools">
          <IconButton
            type="button"
            variant="toolbar"
            icon={<Icon as={ArrowRotateRight} />}
            disabled={snapshot.loading}
            onClick={() => { void sessionRef.current?.refresh() }}
            aria-label={locale.text('refresh')}
            title={locale.text('refresh')}
          />
        </div>
      </div>
      <If cond={Boolean(snapshot.error)}>
        <div className="dshp-pet__market-error" role="alert">
          <span>{locale.text('marketFailed')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon as={ArrowRotateRight} />}
            disabled={snapshot.loading}
            onClick={() => { void sessionRef.current?.refresh() }}
          >
            {locale.text('retry')}
          </Button>
        </div>
      </If>
      <If cond={snapshot.loading && snapshot.pets.length === 0}>
        <p className="dshp-pet__loading" role="status">{locale.text('loading')}</p>
      </If>
      <If cond={!snapshot.loading && !snapshot.error && snapshot.pets.length === 0}>
        <p className="dshp-pet__empty">{locale.text('marketEmpty')}</p>
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
