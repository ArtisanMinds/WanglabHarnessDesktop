import type { ReactElement } from 'react'
import type { Translate } from '../locales/index.types'
import type { RunView, TaskFormState, TaskView } from '../types'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { Check, CommentPlus, Icon, Magnifier, Plus, useMountStyle } from 'dsh-tauri-ui/client'
import { filter, includes, isEmpty, lowerCase, omit, useEventListener } from 'dsh-tauri/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { REFRESH_INTERVAL_MS, SCHEDULER_PANEL_STYLE_ID } from '../constants'
import { useScheduler } from '../hooks/use-scheduler'
import { deleteRun, loadScheduler } from '../service/scheduler'
import { store } from '../store'
import { Recommendations } from './recommendations'
import { RunsTab } from './runs-tab'
import { countUnreadRuns, describeSchedule, formatRelative, isTaskPaused } from './schedule.utils'
import schedulerPanelStyle from './scheduler-panel.cssr'
import { TaskCard } from './task-card'
import { TaskCreateDialog } from './task-create-dialog'

interface SchedulerPanelProps {
  t: Translate
  onViaChat: () => void
  onOpenSession: (sessionId: string) => 'opened' | 'archived' | 'unavailable'
}

/** 对话框状态：手动创建（无 initial/taskId）、编辑（taskId + initial）、推荐（initial）。 */
type DialogState = { taskId?: string, initial?: TaskFormState } | null

/** 由任务视图构造编辑表单（去掉 timeZone 等宿主字段）。 */
function taskToForm(task: TaskView): TaskFormState {
  return {
    name: task.name,
    // ScheduleForm 不含 timeZone；仅保留 kind 相关字段。
    schedule: omit(task.schedule, 'timeZone') as TaskFormState['schedule'],
    prompt: task.prompt,
    workspaceId: task.workspaceId ?? '',
    permission: task.permission || 'read-only',
    provider: task.provider ?? '',
    model: task.model ?? '',
    // 编辑旧任务（无显式推理等级）时不预填。
    reasoningEffort: task.reasoningEffort || '',
  }
}

export function SchedulerPanel({ t, onViaChat, onOpenSession }: SchedulerPanelProps): ReactElement {
  useMountStyle(schedulerPanelStyle, SCHEDULER_PANEL_STYLE_ID)
  const state = useScheduler()
  const [tab, setTab] = useState<'tasks' | 'runs'>('tasks')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [openError, setOpenError] = useState('')
  // 相对「下次运行」以刷新时刻为基准，避免每次渲染抖动。
  const [now, setNow] = useState(() => Date.now())

  // 首帧载入：面板打开时拉一次全量（含对话框选项）。轮询只做增量刷新。
  useEffect(() => {
    void loadScheduler(true)
  }, [])

  // 拉取由注册层轮询（面板关闭时也要更新未读角标），这里只推进相对时间基准。
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  // 回到前台 / 重新聚焦时立刻补一次刷新（离开期间轮询可能被浏览器节流）。
  // reause 的 useEventListener 收的是 ref 目标（与 dsh-tauri-worktree 的 dialog 一致）。
  const refreshOnResume = useCallback((): void => {
    if (document.visibilityState === 'visible')
      void loadScheduler(false)
  }, [])
  const documentRef = useRef<Document | null | undefined>(typeof document === 'undefined' ? undefined : document)
  const windowRef = useRef<Window | null | undefined>(typeof window === 'undefined' ? undefined : window)
  useEventListener(documentRef, 'visibilitychange', refreshOnResume)
  useEventListener(windowRef, 'focus', refreshOnResume)

  const filtered = filter(state.tasks, task =>
    isEmpty(search) || includes(lowerCase(`${task.name} ${task.prompt}`), lowerCase(search)))
  const filteredRuns = filter(state.runs, run =>
    isEmpty(search) || includes(lowerCase(run.taskName), lowerCase(search)))
  const unread = countUnreadRuns(state.runs, state.readAt, state.readIds)

  function onOpenRun(run: RunView): void {
    // 点开即视为看过：归档或不可用也不留下永远消不掉的未读。
    store.scheduler.markRunRead(run.id)
    if (run.sessionId === undefined) {
      setOpenError(t('openRunFailed'))
      return
    }
    const outcome = onOpenSession(run.sessionId)
    if (outcome === 'archived') {
      setOpenError(t('runSessionArchived'))
      return
    }
    if (outcome === 'unavailable') {
      setOpenError(t('openRunFailed'))
      return
    }
    setOpenError('')
  }

  return (
    <div className="dshp-scheduler__shell">
      <header className="dshp-scheduler__top">
        <div className="dshp-scheduler__heading">
          <h1>{t('scheduler')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className="dshp-scheduler__toolbar">
          <Button variant="outline" size="sm" icon={<Icon as={CommentPlus} />} onClick={onViaChat}>
            {t('viaChat')}
          </Button>
          <Button variant="primary" size="sm" icon={<Icon as={Plus} size={13} />} onClick={() => setDialog({})}>
            {t('createManual')}
          </Button>
        </div>
      </header>

      <div className="dshp-scheduler__search-bar">
        <div className="dshp-scheduler__search-wrap">
          <Icon as={Magnifier} className="dshp-scheduler__search-icon" />
          <input
            className="dshp-scheduler__input"
            type="search"
            aria-label={t('searchPlaceholder')}
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        {tab === 'runs' && unread > 0
          ? (
              <Button variant="ghost" size="sm" icon={<Icon as={Check} />} onClick={() => store.scheduler.markAllRunsRead()}>
                {t('markAllRead')}
              </Button>
            )
          : null}
      </div>

      <div className="dshp-scheduler__tabs" role="tablist" aria-label={t('scheduler')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tasks'}
          className={tab === 'tasks' ? `${'dshp-scheduler__tab'} ${'dshp-scheduler__tab--active'}` : 'dshp-scheduler__tab'}
          onClick={() => setTab('tasks')}
        >
          {t('tasksTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'runs'}
          className={tab === 'runs' ? `${'dshp-scheduler__tab'} ${'dshp-scheduler__tab--active'}` : 'dshp-scheduler__tab'}
          onClick={() => setTab('runs')}
        >
          {t('runsTab')}
        </button>
      </div>

      {state.error ? <p className="dshp-scheduler__error" role="alert">{state.error}</p> : null}
      {openError ? <p className="dshp-scheduler__error" role="alert">{openError}</p> : null}

      {tab === 'tasks'
        ? (
            <>
              {filtered.length === 0
                ? <p className="dshp-scheduler__empty">{search ? t('noMatch') : t('emptyTasks')}</p>
                : (
                    <ul className="dshp-scheduler__cards">
                      {filtered.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          t={t}
                          describe={describeSchedule(task.schedule, t)}
                          nextRun={task.enabled ? formatRelative(task.nextRunAt, now, t) : undefined}
                          paused={isTaskPaused(task)}
                          onEdit={task => setDialog({ taskId: task.id, initial: taskToForm(task) })}
                        />
                      ))}
                    </ul>
                  )}
              <Recommendations t={t} tasks={state.tasks} />
            </>
          )
        : (
            <RunsTab
              t={t}
              runs={filteredRuns}
              readAt={state.readAt}
              readIds={state.readIds}
              emptyLabel={search ? t('noMatchRuns') : t('emptyRuns')}
              onOpen={onOpenRun}
              onDelete={id => void deleteRun(id)}
            />
          )}

      {dialog
        ? <TaskCreateDialog t={t} options={state.options} initial={dialog.initial} taskId={dialog.taskId} onClose={() => setDialog(null)} />
        : null}
    </div>
  )
}
