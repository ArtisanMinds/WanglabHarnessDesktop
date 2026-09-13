/**
 * host/service/lock.test.ts — 跨进程工作区锁。
 *
 * 三条不变量：**互斥**（两个锁实例代指两个宿主进程，绝不同时进临界区）、
 * **自愈**（持有者崩溃留下的死 pid / 残骸必须能被接管，否则一次崩溃就让该工作区永久失效）、
 * **不误伤**（活着的持有者绝不被抢；接管复核失败要把第三方的新锁放回去）。
 *
 * 用例全部跑在临时目录的真实文件系统上：锁的价值就在「两个进程看到同一个文件」，
 * mock 掉 fs 等于什么都没验证。
 */

import type { WorkspaceLock, WorkspaceLockHolder } from '../types'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { REASON_WORKSPACE_BUSY } from '../constants'
import { createWorkspaceLock, takeOverLock, WorkspaceLockTimeoutError } from './lock'

/**
 * 一个保证不存在的 pid：超范围 pid 在任何平台上都会让 `process.kill(pid, 0)` 抛 `ESRCH`，
 * 等价于「持有者进程已经没了」——崩溃残骸的标准形态。
 */
const DEAD_PID = 2147483647

const temporaryDirectories: string[] = []

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-turnrewind-lock-'))
  temporaryDirectories.push(root)
  const dshHome = join(root, 'home')
  await mkdir(dshHome, { recursive: true })
  return dshHome
}

afterEach(async () => {
  while (temporaryDirectories.length > 0)
    await rm(temporaryDirectories.pop() as string, { recursive: true, force: true }).catch(() => undefined)
})

function lockFor(dshHome: string, timeoutMs = 2000, retryMs = 5): WorkspaceLock {
  return createWorkspaceLock({ dshHome, timeoutMs, retryMs })
}

/** 直接往锁位写一个持有者，模拟「另一个进程留下的锁」。 */
async function seedHolder(lock: WorkspaceLock, key: string, holder: WorkspaceLockHolder): Promise<void> {
  const path = lock.lockPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(holder)}\n`, 'utf8')
}

async function readSeededHolder(lock: WorkspaceLock, key: string): Promise<WorkspaceLockHolder> {
  return JSON.parse(await readFile(lock.lockPath(key), 'utf8')) as WorkspaceLockHolder
}

/** 锁位旁边留下的接管残骸（`.stale-*`）：正常情况下必须为空。 */
async function listDebris(lock: WorkspaceLock, key: string): Promise<string[]> {
  const names = await readdir(dirname(lock.lockPath(key))).catch(() => [] as string[])
  return names.filter(name => name.includes('.stale-'))
}

/** 直接写一个**空**锁文件：写者刚 `open` 还没 `write` 的形态。 */
async function seedEmpty(lock: WorkspaceLock, key: string): Promise<void> {
  const path = lock.lockPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '')
}

/** 闸门：把第一个任务钉在临界区里，用来观察后到者是不是真的在门外等。 */
function gate(): { wait: Promise<void>, open: () => void } {
  let open: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

describe('createWorkspaceLock — 互斥', () => {
  it('同一工作区：后到者必须等前一个释放，临界区绝不重叠', async () => {
    const dshHome = await fixture()
    const first = lockFor(dshHome, 5000)
    const second = lockFor(dshHome, 5000)
    const events: string[] = []
    let inFlight = 0
    const held = gate()

    const holding = first.run('C:/repo', async () => {
      inFlight += 1
      events.push('first:start')
      await held.wait
      events.push('first:end')
      inFlight -= 1
    })
    await tick(30)

    const waiting = second.run('C:/repo', async () => {
      inFlight += 1
      // 关键不变量：第二个任务进临界区时，第一个必须已经退出。
      expect(inFlight).toBe(1)
      events.push('second:start')
      inFlight -= 1
      events.push('second:end')
    })
    await tick(50)
    expect(events).toEqual(['first:start'])

    held.open()
    await Promise.all([holding, waiting])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('不同工作区：两把锁互不阻塞', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome)
    const order: string[] = []
    const held = gate()

    const slow = lock.run('C:/repo-a', async () => {
      order.push('a:start')
      await held.wait
      order.push('a:end')
    })
    await tick(20)
    await lock.run('C:/repo-b', async () => {
      order.push('b')
    })
    // b 没有排在 a 的闸门后面：不同工作区不是同一把锁。
    expect(order).toEqual(['a:start', 'b'])

    held.open()
    await slow
    expect(order).toEqual(['a:start', 'b', 'a:end'])
  })

  it('等不到锁：报 WorkspaceLockTimeoutError，并带上线协议原因码', async () => {
    const dshHome = await fixture()
    const holder = lockFor(dshHome)
    const late = lockFor(dshHome, 60)
    const held = gate()

    const holding = holder.run('C:/repo', async () => {
      await held.wait
    })
    await tick(20)

    const failure = late.run('C:/repo', async () => 'never')
    await expect(failure).rejects.toBeInstanceOf(WorkspaceLockTimeoutError)
    // 原因码是给撤销路由用的：据此回 409，而不是把「忙」当成 500。
    const error = await failure.then(() => null, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(WorkspaceLockTimeoutError)
    if (!(error instanceof WorkspaceLockTimeoutError))
      return
    expect(error.reason).toBe(REASON_WORKSPACE_BUSY)

    held.open()
    await holding
  })

  it('等待上限可按次覆盖：屏障上只等传进来的那个短上限', async () => {
    const dshHome = await fixture()
    const holder = lockFor(dshHome)
    // 默认上限 5 秒：按次覆盖一旦失效，这个用例会等满 5 秒才抛（断言就抓得到）。
    const late = lockFor(dshHome, 5000)
    const held = gate()

    const holding = holder.run('C:/repo', async () => {
      await held.wait
    })
    await tick(20)

    const started = Date.now()
    await expect(late.run('C:/repo', async () => 'never', 60)).rejects.toBeInstanceOf(WorkspaceLockTimeoutError)
    expect(Date.now() - started).toBeLessThan(1500)

    held.open()
    await holding
  })

  it('任务抛错也必须释放：一次失败不能把工作区永久占住', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome, 500)

    await expect(lock.run('C:/repo', async () => {
      throw new Error('捕获失败')
    })).rejects.toThrow('捕获失败')

    await expect(lock.run('C:/repo', async () => 'ok')).resolves.toBe('ok')
    expect(existsSync(lock.lockPath('C:/repo'))).toBe(false)
  })
})

describe('createWorkspaceLock — 接管', () => {
  it('死 pid / 崩溃残骸：立刻接管，不必等满等待上限', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome, 3000)

    await seedHolder(lock, 'C:/repo', { pid: DEAD_PID, token: 'dead-holder', acquiredAt: Date.now() })
    const started = Date.now()
    await expect(lock.run('C:/repo', async () => 'ok')).resolves.toBe('ok')
    expect(Date.now() - started).toBeLessThan(1000)

    // 进程死在 open 与 write 之间会留下空文件；写到一半被杀会留下半截 JSON。
    const path = lock.lockPath('C:/repo')
    await writeFile(path, '', 'utf8')
    await expect(lock.run('C:/repo', async () => 'empty')).resolves.toBe('empty')
    await writeFile(path, '{"pid": 4242, "token": "cut-of', 'utf8')
    await expect(lock.run('C:/repo', async () => 'truncated')).resolves.toBe('truncated')
  })

  it('活着的持有者：锁再旧也绝不抢（挂死时宁可等满超时），锁位内容原样保留', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome, 60)
    // acquiredAt 是 2020 年：即便「很旧」也不构成接管理由——抢活锁会让两个进程同写私有仓。
    await seedHolder(lock, 'C:/repo', { pid: process.pid, token: 'live-holder', acquiredAt: Date.UTC(2020, 0, 1) })

    await expect(lock.run('C:/repo', async () => 'never')).rejects.toBeInstanceOf(WorkspaceLockTimeoutError)
    expect((await readSeededHolder(lock, 'C:/repo')).token).toBe('live-holder')
  })

  it('锁位已被换成活锁：接管连碰都不碰它（复核失败就收手）', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome)
    const path = lock.lockPath('C:/repo')
    // 锁位上此刻是**活着的**新锁；我们带着「判定时那份已死锁」的原始内容去接管。
    await seedHolder(lock, 'C:/repo', { pid: process.pid, token: 'newcomer', acquiredAt: Date.now() })

    expect(takeOverLock(path, JSON.stringify({ pid: DEAD_PID, token: 'stale', acquiredAt: 1 }))).toBe(false)
    // 新锁必须原样留在锁位，而且**根本不该被搬走**：锁位旁边不许出现接管残骸。
    expect((await readSeededHolder(lock, 'C:/repo')).token).toBe('newcomer')
    expect(await listDebris(lock, 'C:/repo')).toEqual([])
  })

  it('并发抢陈旧锁（含空残骸）时任意时刻只有一个持有者', async () => {
    const dshHome = await fixture()
    const seeder = lockFor(dshHome, 5000, 2)
    const locks = [seeder, ...Array.from({ length: 5 }, () => lockFor(dshHome, 5000, 2))]
    let inFlight = 0
    let maxInFlight = 0

    for (let round = 0; round < 12; round += 1) {
      // 偶数轮种「持有者已死」的锁；奇数轮种**空文件**——那正是「写者刚 open、还没来得及 write」
      // 的形态，也是接管判定里最脆的一档：六个实例同时判定可接管、抢着改名，必须同样只有一个赢家。
      if (round % 2 === 0)
        await seedHolder(seeder, 'C:/repo', { pid: DEAD_PID, token: `stale-${round}`, acquiredAt: Date.now() })
      else
        await seedEmpty(seeder, 'C:/repo')

      await Promise.all(locks.map(lock => lock.run('C:/repo', async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await tick(1)
        inFlight -= 1
      })))
    }

    expect(maxInFlight).toBe(1)
    // 正常路径下不留残骸：每一轮清场都该把自己的残骸删掉。
    expect(await listDebris(seeder, 'C:/repo')).toEqual([])
  })

  it('锁目录被外部删掉后自愈：重建目录继续工作，而不是永久加不上锁', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome)

    await expect(lock.run('C:/repo', async () => 'first')).resolves.toBe('first')
    await rm(dirname(lock.lockPath('C:/repo')), { recursive: true, force: true })

    await expect(lock.run('C:/repo', async () => 'second')).resolves.toBe('second')
  })
})

describe('createWorkspaceLock — 释放与锁位', () => {
  it('释放只删自己那一把：锁位已被换成别的 token 时不误删', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome, 500)
    const held = gate()

    const holding = lock.run('C:/repo', async () => {
      await held.wait
    })
    await tick(20)
    await seedHolder(lock, 'C:/repo', { pid: DEAD_PID, token: 'other-process', acquiredAt: Date.now() })

    held.open()
    await holding
    expect((await readSeededHolder(lock, 'C:/repo')).token).toBe('other-process')
  })

  it('锁位：$DSH_HOME 下的私有目录，按工作区哈希一一对应（Windows 折叠大小写）', async () => {
    const dshHome = await fixture()
    const lock = lockFor(dshHome)
    const path = lock.lockPath('C:/repo')

    // 与账本、私有仓同在 `$DSH_HOME/<plugin>/` 之下：清理与诊断只需要看一个目录。
    expect(dirname(path)).toBe(join(dshHome, 'dsh-tauri-turnrewind', 'locks'))
    expect(path.endsWith('.lock')).toBe(true)
    expect(lock.lockPath('C:/repo')).toBe(path)
    expect(lock.lockPath('C:/other-repo')).not.toBe(path)
    expect(lock.lockPath('C:/Repo') === lock.lockPath('c:/repo')).toBe(process.platform === 'win32')
  })
})
