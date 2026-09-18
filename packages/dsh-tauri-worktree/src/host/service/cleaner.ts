import type { DiscardJob, OperationResult } from '../types'
import { randomUUID } from 'node:crypto'
import { clearTimeout, setTimeout } from 'node:timers'
import { defineService } from 'dsh-tauri'
import { filter, find, findLast, get, take } from 'lodash-es'
import { jobs } from './jobs'

const DISCARD_JOB_RETENTION = 64

const DISCARD_RETRY_ATTEMPTS = 3

const DISCARD_RETRY_DELAY_MS = 2_000

/** 一轮三连失败后的等待梯度：句柄往往几秒后就释放了，但卡死的目录不该被无限猛冲。 */
const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const

const queue = new Map<string, DiscardJob>()
const inFlight = new Map<string, Promise<DiscardJob>>()
const runners = new Map<string, () => Promise<OperationResult>>()
const timers = new Map<string, NodeJS.Timeout>()
let restored = false
let pendingWrite: Promise<void> = Promise.resolve()

const queueArray = (): DiscardJob[] => [...queue.values()]

export const cleaner = defineService({
  start(
    sessionId: string,
    worktreeKey: string,
    worktreePath: string | undefined,
    run: () => Promise<OperationResult>,
    force = false,
  ): DiscardJob {
    restore()
    const reused = reuseOf(sessionId, worktreeKey, force)
    if (reused)
      return reused

    const previous = findLast(queueArray(), { sessionId, worktreeKey })
    const target = worktreePath ?? previous?.worktreePath
    const job: DiscardJob = {
      jobId: previous?.jobId ?? randomUUID(),
      sessionId,
      worktreeKey,
      ...(target ? { worktreePath: target } : {}),
      state: 'deleting',
      ...(previous?.attempts ? { attempts: previous.attempts } : {}),
    }
    if (previous)
      clearRetry(previous.jobId)
    prune()
    queue.set(job.jobId, job)
    runners.set(job.jobId, run)
    persist()
    void execute(job, keyOf(sessionId, worktreeKey), run)
    return job
  },

  lookup(sessionId: string, jobId?: string): DiscardJob | undefined {
    restore()
    return jobId ? queue.get(jobId) : findLast(queueArray(), { sessionId })
  },

  unsettled(): DiscardJob[] {
    restore()
    return filter(queueArray(), job => job.state !== 'completed')
  },
})

// --- internal ---

function keyOf(sessionId: string, worktreeKey: string): string {
  return `${sessionId}:${worktreeKey}`
}

function findJob(sessionId: string, worktreeKey: string, state: DiscardJob['state']): DiscardJob | undefined {
  return find(queueArray(), { sessionId, worktreeKey, state })
}

/** 在途任务与已排队退避的任务都不重复触发；显式丢弃（force）才越过退避立刻重来。 */
function reuseOf(sessionId: string, worktreeKey: string, force: boolean): DiscardJob | undefined {
  if (inFlight.has(keyOf(sessionId, worktreeKey)))
    return findJob(sessionId, worktreeKey, 'deleting')
  const completed = findJob(sessionId, worktreeKey, 'completed')
  if (completed)
    return completed
  const failed = findJob(sessionId, worktreeKey, 'failed')
  if (!force && failed && timers.has(failed.jobId))
    return failed
  return undefined
}

function prune(): void {
  if (queue.size < DISCARD_JOB_RETENTION)
    return
  const removable = filter(queueArray(), { state: 'completed' })
  take(removable, queue.size - DISCARD_JOB_RETENTION + 1)
    .forEach(job => queue.delete(job.jobId))
}

/** 首次访问时把落盘的未完成删除任务读回内存：进程重启不会丢掉待删队列。 */
function restore(): void {
  if (restored)
    return
  restored = true
  for (const record of jobs.load()) {
    if (!queue.has(record.jobId))
      queue.set(record.jobId, record)
  }
}

/** 串行落盘，始终写最新快照，避免乱序写回旧状态。 */
function persist(): void {
  pendingWrite = pendingWrite
    .then(() => jobs.save(filter(queueArray(), job => job.state !== 'completed')))
    .catch(() => {})
}

function clearRetry(jobId: string): void {
  const timer = timers.get(jobId)
  if (!timer)
    return
  clearTimeout(timer)
  timers.delete(jobId)
}

function backoffOf(attempts: number): number {
  const step = Math.min(RETRY_BACKOFF_MS.length - 1, Math.floor(attempts / DISCARD_RETRY_ATTEMPTS) - 1)
  return RETRY_BACKOFF_MS[Math.max(0, step)]
}

/** 同进程内已知删除动作的任务自己按退避再来一轮，不必等外部巡检。 */
function scheduleRetry(job: DiscardJob): void {
  const run = runners.get(job.jobId)
  if (!run)
    return
  clearRetry(job.jobId)
  timers.set(job.jobId, setTimeout(() => {
    timers.delete(job.jobId)
    const pending = queue.get(job.jobId)
    if (!pending || pending.state === 'completed')
      return
    const next: DiscardJob = { ...pending, state: 'deleting' }
    queue.set(next.jobId, next)
    persist()
    void execute(next, keyOf(next.sessionId, next.worktreeKey), run)
  }, backoffOf(job.attempts ?? 0)))
}

function execute(job: DiscardJob, key: string, run: () => Promise<OperationResult>): Promise<DiscardJob> {
  const existing = inFlight.get(key)
  if (existing)
    return existing

  let attempts = job.attempts ?? 0

  const settle = (state: DiscardJob['state'], error?: string): DiscardJob => {
    const updated: DiscardJob = { ...job, state, attempts, ...(error === undefined ? {} : { error }) }
    queue.set(job.jobId, updated)
    persist()
    if (state === 'completed') {
      clearRetry(job.jobId)
      runners.delete(job.jobId)
    }
    else {
      scheduleRetry(updated)
    }
    return updated
  }

  const promise = (async (): Promise<DiscardJob> => {
    let lastError = ''
    for (let attempt = 0; attempt < DISCARD_RETRY_ATTEMPTS; attempt += 1) {
      attempts += 1
      const result = await run()
      if (result.ok)
        return settle('completed')
      lastError = result.error
      if (attempt + 1 < DISCARD_RETRY_ATTEMPTS)
        await new Promise(resolve => setTimeout(resolve, DISCARD_RETRY_DELAY_MS))
    }
    return settle('failed', lastError)
  })()
    .catch((error: unknown): DiscardJob => settle('failed', get(error, 'message', String(error))))
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise
}
