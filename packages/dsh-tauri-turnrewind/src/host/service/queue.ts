/**
 * host/service/queue.ts — 工作区级串行：进程内 FIFO + 跨进程文件锁。
 *
 * 私有快照仓的 **index 与 refs 是每个工作区共享的可变状态**：捕获（`add --all` +
 * `write-tree`）、结算、运行中实时读数、撤销（`checkout`）、容量治理（`prune` / 整仓重建）
 * 都在动同一份 index。任何两件并发就会撞 `index.lock` 或读到半更新的 index。
 *
 * 两道闸门各解决一半，缺一不可：
 *   1. **进程内 FIFO**（本文件）：同一进程的任务按提交顺序串行。顺序是**先排队再拿锁**——
 *      反过来会让同一条道里的下一个任务去跟自己人争文件锁，白烧掉等待预算；
 *   2. **跨进程文件锁**（service/lock.ts）：同一个 `$DSH_HOME` 下可能同时有多个宿主进程
 *      （桌面端重启交叠、用户手动再起的 `dsh web`、离线维护脚本），内存队列对它们无效。
 *
 * 队列键统一走 `workspaceKey()`：Windows 上 `C:\Repo` 与 `c:\repo` 是同一个工作区，
 * 用原始字符串排队会分裂成两条道、两份锁文件——会话归属校验早已这么折叠，排队也必须一致。
 *
 * 队尾在结算后立即出队：否则每见过一个工作区就常驻一条 Promise，
 * 长期运行的 Host 会无界增长（与归档版 `enqueueTurnTask` 同一处理）。
 */

import type { WorkspaceLock } from '../types'
import { workspaceKey } from './workspace'

/** 工作区级串行队列。 */
export interface WorkspaceQueue {
  /**
   * 在指定工作区的串行区内执行任务。
   * @param key - 工作区键（worktree 根；内部按 `workspaceKey` 归一）。
   * @param task - 要执行的异步任务。
   * @param lockTimeoutMs - 本次获取**跨进程锁**的等待上限（毫秒）；缺省用锁的默认值。
   *   传更短的值只影响跨进程那一段等待，进程内排队不受影响。
   * @returns 任务结果（拒绝原样透出）。
   */
  run: <T>(key: string, task: () => Promise<T>, lockTimeoutMs?: number) => Promise<T>
  /** 当前仍在排队/在飞的工作区数（诊断与测试用）。 */
  size: () => number
}

/** 队列选项。 */
export interface WorkspaceQueueOptions {
  /**
   * 跨进程锁（见 service/lock.ts）。只要同一个 `$DSH_HOME` 下可能出现第二个宿主进程就必须传：
   * 只靠进程内队列，两个进程会并发动同一份私有仓的 index 与 refs。
   * 缺省（省略）时只做进程内串行。
   */
  lock?: WorkspaceLock | undefined
}

/** 创建一个工作区级 FIFO 队列。 */
export function createWorkspaceQueue(options: WorkspaceQueueOptions = {}): WorkspaceQueue {
  const lock = options.lock
  const tails = new Map<string, Promise<unknown>>()
  return {
    run<T>(rawKey: string, task: () => Promise<T>, lockTimeoutMs?: number): Promise<T> {
      // 归一后再排队与加锁：大小写不同的同一路径必须共用一条道（否则两条道会并发）。
      const key = workspaceKey(rawKey)
      const previous = tails.get(key) ?? Promise.resolve()
      // 前一个任务失败不能阻断后续排队者：队尾只保留「已结算」的守卫 promise。
      const settled = previous.then(async (): Promise<T> => {
        if (lock === undefined)
          return task()
        return lock.run(key, task, lockTimeoutMs)
      })
      const guard = settled.then(() => undefined, () => undefined)
      tails.set(key, guard)
      void guard.then(() => {
        if (tails.get(key) === guard)
          tails.delete(key)
      })
      return settled
    },
    size: () => tails.size,
  }
}
