import type { ReactElement } from 'react'
import type { SurfaceBarProps } from './surface.types'
import { CircleTree, GoalBar, GoalBarAction, Icon } from 'dsh-tauri-ui/client'
import { useState } from 'react'
import { useWorktreeSession } from '../hooks/use-worktree-session'
import { locale } from '../locales'
import { store } from '../store'

export function WorktreeSurface({ sessionId }: SurfaceBarProps): ReactElement | null {
  locale.useLocale()
  const state = useWorktreeSession(sessionId)
  const [logOpen, setLogOpen] = useState(false)

  if (state.phase === 'idle' || (state.mode === 'local' && state.phase !== 'error'))
    return null

  const creating = state.phase === 'creating'
  const deleting = state.phase === 'deleting'
  const failed = state.phase === 'error'
  const bound = state.mode === 'worktree'
  const label = creating
    ? state.loadingLabel || locale.text('progressCreating')
    : deleting
      ? locale.text('progressDeleting')
      : failed
        ? locale.text('progressError')
        : locale.text('surfaceWorktree')

  return (
    <div className="dshp-worktree">
      <div className="dshp-worktree__surface">
        <GoalBar
          actions={(
            <>
              {bound && !deleting && (
                <>
                  <GoalBarAction onClick={() => store.worktree.patch(sessionId, { checkoutOpen: true, error: '' })}>
                    {locale.text('surfaceCheckout')}
                  </GoalBarAction>
                  <GoalBarAction variant="danger" onClick={() => store.worktree.patch(sessionId, { abandonOpen: true })}>
                    {locale.text('surfaceAbandon')}
                  </GoalBarAction>
                </>
              )}
              {failed && !bound && (
                <GoalBarAction onClick={() => store.worktree.patch(sessionId, { phase: 'idle', error: '' })}>
                  {locale.text('surfaceDismiss')}
                </GoalBarAction>
              )}
            </>
          )}
          data-dsh-worktree-surface={sessionId}
          error={failed ? state.error : undefined}
          glyph={<Icon as={CircleTree} size={14} />}
          label={`${label}${creating ? '...' : ''}`}
        >
          {bound && state.log.length > 0 && (
            <div className="dshp-worktree__surface-content">
              <GoalBarAction onClick={() => setLogOpen(value => !value)}>
                {locale.text('progressViewLogs')}
              </GoalBarAction>
            </div>
          )}
        </GoalBar>
        <Logs log={state.log} open={logOpen} />
      </div>
    </div>
  )
}

export function Logs({ log, open }: { log: readonly string[], open: boolean }): ReactElement {
  return (
    <div
      aria-hidden={!open}
      className={`${'dshp-worktree__logs'} ${open ? 'dshp-worktree__logs--open' : ''}`}
    >
      <div className="dshp-worktree__logs-inner">
        <div className="dshp-worktree__logs-panel">
          {log.map((line, index) => <div key={`${index}:${line}`} className="dshp-worktree__log-line">{line}</div>)}
        </div>
      </div>
    </div>
  )
}
