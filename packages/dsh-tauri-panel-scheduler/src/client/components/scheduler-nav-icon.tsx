import type { ReactElement } from 'react'
import { Clock, Icon } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { store } from '../store'
import { countUnreadRuns } from './schedule.utils'

export function SchedulerNavIcon({ size }: { size: number }): ReactElement {
  const state = useStore(store.scheduler)
  return (
    <>
      <Icon as={Clock} size={size} />
      {countUnreadRuns(state.runs, state.readAt, state.readIds) > 0
        ? (
            <span className="dshp-scheduler__nav-badge">
              <span className="dshp-scheduler__unread-dot" />
            </span>
          )
        : null}
    </>
  )
}
