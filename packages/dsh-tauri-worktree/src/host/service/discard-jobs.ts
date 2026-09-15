/**
 * host/service/discard-jobs.ts — 「放弃工作树」后台删除任务的登记表。
 *
 * 为什么独立成域：删除一个工作树要跑 git worktree remove + 删分支 + 断开依赖链接，
 * 客户端不能同步等待，因此宿主登记一个 job 并立刻返回 jobId，由客户端轮询
 * `/status?jobId=` 收敛。登记表本身是 apply 期状态（随插件生命周期建立与销毁），
 * 与 HTTP 面无关，故放在 service 里、由 `createDiscardJobs` 建一份交给路由依赖。
 *
 * 有界性与幂等：
 *   - 已完成任务只保留最近 `JOB_RETENTION` 条（长时间会话里 status 轮询仍能查到活跃/失败任务）；
 *   - 同一 (sessionId, worktreeHashDirname) 的在飞任务合并为一个 Promise，重复点击不叠加；
 *   - 删除失败按 `RETRY_ATTEMPTS` 重试，仍失败则记为 `failed` 并把错误留给 status 展示。
 */

import type { HostContext } from '../types'
import { randomUUID } from 'node:crypto'
import { discardWorktree } from './operation'

/** 一次「放弃工作树」的后台删除任务。 */
export interface DiscardJob {
  jobId: string
  sessionId: string
  /** 工作树标识 `[hash]/[dirname]`（与客户端契约一致）。 */
  worktreeKey: string
  worktreePath?: string
  state: 'deleting' | 'completed' | 'failed'
  error?: string
}

/** 任务登记表的公开面。 */
export interface DiscardJobs {
  /** 未收敛（deleting / failed）的任务：供 `GET /bindings` 展示。 */
  unsettled: () => DiscardJob[]
  /** 按 jobId 取任务；未给 jobId 时取该会话最近一次任务。 */
  lookup: (sessionId: string, jobId: string) => DiscardJob | undefined
  /** 复用同 (会话, worktree key) 的进行中 / 已完成任务；无则 undefined。 */
  reuse: (sessionId: string, worktreeHashDirname: string) => DiscardJob | undefined
  /** 登记并启动删除任务，返回新任务。 */
  start: (sessionId: string, worktreeHashDirname: string, worktreePath?: string) => DiscardJob
}

/** 建立登记表所需的 apply 期依赖。 */
export interface DiscardJobsOptions {
  ctx: HostContext
  worktreesRoot: string
  linkDependencyDirectories?: string[]
}

/** 删除失败的重试次数与间隔。 */
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 2_000
/** 已完成任务的保留条数。 */
const JOB_RETENTION = 64

/**
 * 建立一份删除任务登记表（apply 期一份；卸载即随插件丢弃）。
 *
 * @param options - 宿主 ctx、工作树数据根与依赖链接目录配置。
 * @returns 任务登记表：登记、查询与后台执行。
 */
export function createDiscardJobs(options: DiscardJobsOptions): DiscardJobs {
  const { ctx, worktreesRoot, linkDependencyDirectories } = options
  const jobs = new Map<string, DiscardJob>()
  const inFlight = new Map<string, Promise<DiscardJob>>()

  const keyOf = (sessionId: string, worktreeHashDirname: string): string => `${sessionId}:${worktreeHashDirname}`

  const findJob = (sessionId: string, worktreeHashDirname: string, state: DiscardJob['state']): DiscardJob | undefined =>
    [...jobs.values()].find(item =>
      item.sessionId === sessionId && item.worktreeKey === worktreeHashDirname && item.state === state)

  // Keep the job map bounded: oldest settled jobs disappear first so status
  // polling of active/failed jobs keeps working during long sessions.
  const prune = (): void => {
    if (jobs.size < JOB_RETENTION)
      return
    for (const [id, item] of jobs) {
      if (jobs.size < JOB_RETENTION)
        break
      if (item.state === 'completed')
        jobs.delete(id)
    }
  }

  const run = (job: DiscardJob, key: string, worktreeHashDirname: string): Promise<DiscardJob> => {
    const existing = inFlight.get(key)
    if (existing)
      return existing
    const promise = (async (): Promise<DiscardJob> => {
      let lastError = ''
      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
        const result = await discardWorktree(ctx, worktreesRoot, {
          sessionId: job.sessionId,
          worktree_hash_dirname: worktreeHashDirname,
        }, { linkDependencyDirectories })
        if (result.ok) {
          const updated: DiscardJob = { ...job, state: 'completed' }
          jobs.set(job.jobId, updated)
          return updated
        }
        lastError = result.error
        if (attempt + 1 < RETRY_ATTEMPTS)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
      const updated: DiscardJob = { ...job, state: 'failed', error: lastError }
      jobs.set(job.jobId, updated)
      return updated
    })().catch((error: unknown) => {
      const updated: DiscardJob = { ...job, state: 'failed', error: error instanceof Error ? error.message : String(error) }
      jobs.set(job.jobId, updated)
      return updated
    }).finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, promise)
    return promise
  }

  return {
    unsettled: () => [...jobs.values()].filter(job => job.state !== 'completed'),

    lookup: (sessionId, jobId) => jobId
      ? jobs.get(jobId)
      : [...jobs.values()].reverse().find(item => item.sessionId === sessionId),

    reuse: (sessionId, worktreeHashDirname) => {
      if (inFlight.has(keyOf(sessionId, worktreeHashDirname))) {
        const deleting = findJob(sessionId, worktreeHashDirname, 'deleting')
        if (deleting)
          return deleting
      }
      return findJob(sessionId, worktreeHashDirname, 'completed')
    },

    start: (sessionId, worktreeHashDirname, worktreePath) => {
      const job: DiscardJob = {
        jobId: randomUUID(),
        sessionId,
        worktreeKey: worktreeHashDirname,
        worktreePath,
        state: 'deleting',
      }
      prune()
      jobs.set(job.jobId, job)
      void run(job, keyOf(sessionId, worktreeHashDirname), worktreeHashDirname)
      return job
    },
  }
}
