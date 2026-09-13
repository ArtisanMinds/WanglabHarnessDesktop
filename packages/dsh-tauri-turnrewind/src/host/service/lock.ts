/**
 * host/service/lock.ts — 工作区级跨进程互斥（只做 turnrewind 需要的那一件事）。
 *
 * 私有快照仓的 `index`/`refs` 是磁盘上的共享可变状态，而同一个 `$DSH_HOME` 下可能有第二个
 * 宿主进程（桌面端重启交叠、手动再起的 `dsh web`、维护脚本）——进程内的 FIFO 队列
 * （service/queue.ts）只挡得住自己这一个进程。
 *
 * 形态：`locks/<workspaceHash>.lock`，`openSync(path, 'wx')` 原子创建，内容
 * `{ pid, token, acquiredAt }`；释放只删 token 仍是自己的那一把。
 *
 * 只有两种锁会被接管，**活着的持有者永不被抢**：内容读不出持有者（崩溃残骸）、记录里的 pid
 * 已不存在（`EPERM` 视为存活）。接管是「**先复核、再改名、改名后二次复核**」——**不是原子 CAS**：
 * `rename` 只保证路径级只有一个赢家（避免「两人都删都建、于是都以为拿到了锁」），并不保证搬走的
 * 仍是判定时那一份。所以两次复核之间发现内容变了就**放回锁位**并让出；反方向由写者获取后的回读
 * 自检兜住（见 {@link createLock}）。两者缺一不可。
 *
 * 残余窗口（如实记录；Node 既没有 `flock`，`rename` 也不带内容条件）：从「复核内容」到「真去改名」
 * 之间若第三方恰好把锁文件换成**活锁**，我们可能把那份活锁移到残骸名——它在「改名 → 放回」这极短的
 * 窗口里对别的进程不可见。放回失败（锁位已被第三方占住）时残骸**保留不删**，它就是这次竞态的唯一
 * 现场；正常路径下残骸立即删除。窗口是两个相邻系统调用，且需要三方时序同时凑齐，实际概率极低。
 *
 * 不接管活锁是有意取舍：持有者挂死时宁可等满超时如实报「占用」，也不去抢一把活锁——抢了会
 * 让两个进程同时写私有仓。单次 git 操作的预算本就被 `GIT_TIMEOUT_MS` 约束。
 */

import type { WorkspaceLock, WorkspaceLockHolder, WorkspaceLockOptions } from '../types'
import { randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import process from 'node:process'
import { dirname, join } from 'pathe'
import { LOCK_DIR_NAME, LOCK_RETRY_INTERVAL_MS, LOCK_WAIT_TIMEOUT_MS, REASON_WORKSPACE_BUSY, SNAPSHOT_FEATURE_DIR } from '../constants'
import { workspaceHash } from './workspace'

/** 等待超时：工作区正被另一个宿主进程占着（撤销据此回 409；其余异常仍是 500）。 */
export class WorkspaceLockTimeoutError extends Error {
  /** 线协议原因码（客户端据此给文案）。 */
  readonly reason = REASON_WORKSPACE_BUSY

  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceLockTimeoutError'
  }
}

/** pid 存活判定：`EPERM` = 进程在、只是没权限发信号，不能当成死亡（判死会去抢活锁）。 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0)
    return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

/** 读锁位：`raw === null` = 文件不在，`holder === null` = 内容读不出持有者（崩溃残骸）。 */
function readLock(path: string): { raw: string | null, holder: WorkspaceLockHolder | null } {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  }
  catch {
    return { raw: null, holder: null }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceLockHolder> | null
    if (parsed === null || typeof parsed !== 'object')
      return { raw, holder: null }
    if (typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0)
      return { raw, holder: null }
    if (typeof parsed.token !== 'string' || parsed.token.length === 0)
      return { raw, holder: null }
    if (typeof parsed.acquiredAt !== 'number' || !Number.isFinite(parsed.acquiredAt))
      return { raw, holder: null }
    return { raw, holder: { pid: parsed.pid, token: parsed.token, acquiredAt: parsed.acquiredAt } }
  }
  catch {
    return { raw, holder: null }
  }
}

/** 删文件；失败不影响正确性（残骸名唯一，不会被当成锁读走）。 */
function removeQuietly(path: string): void {
  try {
    unlinkSync(path)
  }
  catch {
    // ENOENT：已被别人清走；其余错误也无计可施。
  }
}

/**
 * 把一份被误抢走的锁放回锁位（`wx`，绝不复盖第三方已经建好的锁）。
 * @param path - 锁位。
 * @param raw - 抢到的那份原始内容。
 * @returns `nothing`（没内容可放）/ `restored`（已归位）/ `blocked`（锁位已被第三方占住）。
 */
function restoreLock(path: string, raw: string | null): 'blocked' | 'nothing' | 'restored' {
  if (raw === null || raw.length === 0)
    return 'nothing'
  try {
    writeFileSync(path, raw, { flag: 'wx' })
    return 'restored'
  }
  catch {
    // 锁位已被第三方占住：调用方会保留残骸作为现场证据（见文件头注释的残余窗口）。
    return 'blocked'
  }
}

/** 创建锁（`wx` 独占，绝不覆盖别人的锁）+ **回读自检**。 */
function createLock(path: string, holder: WorkspaceLockHolder): boolean {
  try {
    const fd = openSync(path, 'wx')
    try {
      writeSync(fd, `${JSON.stringify(holder)}\n`)
    }
    finally {
      closeSync(fd)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST')
      throw error
  }
  // 自检挡「创建完成 → 写入完成」之间被接管者当成空残骸抢走这一瞬：那时锁位上的 token
  // 已经不是我们的，必须让出，否则两个进程会同时进临界区。
  const seen = readLock(path)
  return seen.holder !== null && seen.holder.token === holder.token
}

/**
 * 接管一把可接管的锁：**改名之前先复核一次**，改名之后再复核一次；抢到的不是判定时那一份就
 * 放回并让出（放不回则保留残骸当现场）。
 *
 * 为什么不是一次原子操作：`rename` 只保证路径级只有一个赢家，不能保证搬走的仍是刚读到的那一份
 * （Node 没有 `flock`，也没有带内容条件的 rename）。两次复核把窗口压到「复核 → 改名」这一对相邻
 * 系统调用之间；真撞上时按文件头注释的残余窗口处理。
 *
 * 导出仅为让测试构造这一情形，不进插件公开面（`src/index.ts` 不 re-export）。
 * @param path - 锁位。
 * @param expectedRaw - 判定可接管时读到的**原始内容**。
 * @returns 是否真正清场（true 后调用方应立即重试创建）。
 */
export function takeOverLock(path: string, expectedRaw: string): boolean {
  // 复核之一（改名之前）：锁位上的内容已经不是判定时那一份 → 有人换过锁，直接不动它。
  if (readLock(path).raw !== expectedRaw)
    return false
  const debris = `${path}.stale-${randomUUID()}`
  try {
    renameSync(path, debris)
  }
  catch {
    // ENOENT：别人先抢走或持有者已释放；EPERM/EBUSY：文件被别的进程打开（Windows 不允许改名）。
    return false
  }
  const grabbed = readLock(debris)
  if (grabbed.raw !== expectedRaw) {
    // 复核之二（改名之后）：窗口里被换过 → 把抢到的那份放回去；放不回去就把残骸留下当现场。
    if (restoreLock(path, grabbed.raw) !== 'blocked')
      removeQuietly(debris)
    return false
  }
  removeQuietly(debris)
  return true
}

/** 等待 `ms` 毫秒（锁竞争的重试节奏）。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 创建一个工作区级跨进程锁。
 * @param options - 数据根目录与（可覆盖的）等待/重试参数。
 */
export function createWorkspaceLock(options: WorkspaceLockOptions): WorkspaceLock {
  const { dshHome } = options
  const timeoutMs = options.timeoutMs ?? LOCK_WAIT_TIMEOUT_MS
  const retryMs = options.retryMs ?? LOCK_RETRY_INTERVAL_MS
  // 锁目录只建一次：实时读数每 1.5s 走一趟队列，每次都 mkdir 就是白付一次系统调用。
  let dirEnsured = false
  const lockPath = (key: string): string =>
    join(dshHome, SNAPSHOT_FEATURE_DIR, LOCK_DIR_NAME, `${workspaceHash(key)}.lock`)

  /**
   * 获取锁；超时抛 {@link WorkspaceLockTimeoutError}。
   * @param key - 工作区键。
   * @param waitMs - 本次获取的等待上限（毫秒）。
   */
  async function acquire(key: string, waitMs: number): Promise<{ path: string, token: string }> {
    const path = lockPath(key)
    if (!dirEnsured) {
      mkdirSync(dirname(path), { recursive: true })
      dirEnsured = true
    }
    // token 每次获取生成一次（不随重试变化）：释放只认它。
    const holder: WorkspaceLockHolder = { pid: process.pid, token: randomUUID(), acquiredAt: Date.now() }
    const deadline = Date.now() + waitMs
    for (;;) {
      const seen = readLock(path)
      if (seen.raw === null) {
        try {
          if (createLock(path, holder))
            return { path, token: holder.token }
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT')
            throw error
          // 锁目录被外部删掉（清理脚本/杀毒）：重建后重试，而不是让该工作区永久加不上锁。
          mkdirSync(dirname(path), { recursive: true })
          dirEnsured = true
        }
      }
      else if (seen.holder === null || !isProcessAlive(seen.holder.pid)) {
        // 清场成功就立刻重试创建，不必白等一个重试周期。
        if (takeOverLock(path, seen.raw))
          continue
      }
      if (Date.now() >= deadline) {
        const owner = seen.holder === null ? 'unreadable debris' : `pid ${seen.holder.pid}`
        throw new WorkspaceLockTimeoutError(`workspace lock not acquired after ${waitMs}ms (key=${key}, holder=${owner})`)
      }
      await delay(retryMs)
    }
  }

  /** 释放：只删 token 仍属于自己的那一把。 */
  function release(path: string, token: string): void {
    const seen = readLock(path)
    // 读不出持有者时不删：那可能是别人刚创建、还没写完的新锁。而「活锁永不被接管」保证
    // 「读 → 删除」之间不会换人，因此这里不需要更重的机制。
    if (seen.holder !== null && seen.holder.token === token)
      removeQuietly(path)
  }

  return {
    async run<T>(key: string, task: () => Promise<T>, lockTimeoutMs?: number): Promise<T> {
      const handle = await acquire(key, lockTimeoutMs ?? timeoutMs)
      try {
        return await task()
      }
      finally {
        release(handle.path, handle.token)
      }
    },
    lockPath,
  }
}
