/**
 * host/service/queue.test.ts — 工作区级串行队列。
 *
 * 这里守的是「同一工作区的私有仓操作绝不并发」这条不变量：index 与 refs 是共享可变状态，
 * 并发就会撞 `index.lock`。另外两条同样重要：不同工作区必须互不阻塞；队尾必须在结算后出队
 * （否则长期运行的 Host 每见一个工作区就常驻一条 Promise，无界增长）。
 */

import type { WorkspaceLock } from '../types'
import { describe, expect, it } from 'vitest'
import { WorkspaceLockTimeoutError } from './lock'
import { createWorkspaceQueue } from './queue'
import { workspaceKey } from './workspace'

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('createWorkspaceQueue', () => {
  it('同一工作区的任务严格 FIFO，绝不重叠', async () => {
    const queue = createWorkspaceQueue()
    const events: string[] = []
    let inFlight = 0

    const task = (name: string, delay: number) => async (): Promise<string> => {
      inFlight += 1
      expect(inFlight).toBe(1)
      events.push(`${name}:start`)
      await tick(delay)
      events.push(`${name}:end`)
      inFlight -= 1
      return name
    }

    // 故意让先入队者更慢：若没有串行化，`b:start` 会插到 `a:end` 前面。
    const first = queue.run('ws', task('a', 20))
    const second = queue.run('ws', task('b', 1))
    const third = queue.run('ws', task('c', 1))

    expect(await Promise.all([first, second, third])).toEqual(['a', 'b', 'c'])
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  })

  it('不同工作区互不阻塞', async () => {
    const queue = createWorkspaceQueue()
    const order: string[] = []
    const slow = queue.run('ws-a', async () => {
      order.push('a:start')
      await tick(20)
      order.push('a:end')
    })
    const fast = queue.run('ws-b', async () => {
      order.push('b:start')
      await tick(1)
      order.push('b:end')
    })
    await Promise.all([slow, fast])
    // b 不必等 a 的 20ms。
    expect(order.indexOf('b:end')).toBeLessThan(order.indexOf('a:end'))
  })

  it('前一个任务失败不阻断后续排队者，且错误原样透出', async () => {
    const queue = createWorkspaceQueue()
    const failing = queue.run('ws', async () => {
      throw new Error('捕获失败')
    })
    const following = queue.run('ws', async () => 'ok')
    await expect(failing).rejects.toThrow('捕获失败')
    await expect(following).resolves.toBe('ok')
  })

  it('结算后队尾出队；不同工作区各自的队尾共享同一张表', async () => {
    const queue = createWorkspaceQueue()
    expect(queue.size()).toBe(0)
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = queue.run('ws-a', async () => {
      await gate
      return 1
    })
    queue.run('ws-b', async () => 2)
    // 队尾表在任务在飞时持有 2 条（a 卡在 gate 上，b 已结算并出队）。
    await tick(5)
    expect(queue.size()).toBe(1)

    const queuedBehind = queue.run('ws-a', async () => 3)
    expect(queue.size()).toBe(1)

    release()
    await expect(pending).resolves.toBe(1)
    await expect(queuedBehind).resolves.toBe(3)
    await tick(5)
    // 全部结算后必须归零：常驻队尾就是泄漏。
    expect(queue.size()).toBe(0)
  })

  it('任务返回值与队列诊断互不干扰', async () => {
    interface Payload { ok: boolean }
    const queue = createWorkspaceQueue()
    const value: Payload = await queue.run('ws', async () => ({ ok: true }))
    expect(value).toEqual({ ok: true })
    await tick(5)
    expect(queue.size()).toBe(0)
  })
})

/**
 * 跨进程锁的接线：队列是「谁先排队」，锁是「谁能动私有仓」。
 * 这里只验证接线本身（获取→任务→释放、失败透出、键归一后再进锁）；
 * 锁自己的语义（pid/接管/双持/释放）在 lock.test.ts 里用真实文件系统钉住。
 */
describe('createWorkspaceQueue — 跨进程锁', () => {
  it('每个任务都包在锁内执行：获取 → 任务 → 释放', async () => {
    const events: string[] = []
    const normalized = workspaceKey('ws')
    const lock: WorkspaceLock = {
      async run<T>(key: string, task: () => Promise<T>): Promise<T> {
        events.push(`acquire:${key}`)
        try {
          return await task()
        }
        finally {
          events.push(`release:${key}`)
        }
      },
      lockPath: (key: string) => key,
    }

    const queue = createWorkspaceQueue({ lock })
    await queue.run('ws', async () => {
      events.push('task')
    })

    // 进锁的是**归一后**的键（Windows 折叠大小写），否则两条道会各自持一把锁。
    expect(events).toEqual([`acquire:${normalized}`, 'task', `release:${normalized}`])
  })

  it('把本次的跨进程等待上限透传给锁（缺省时传 undefined，由锁用自己的默认值）', async () => {
    const seen: Array<number | undefined> = []
    const lock: WorkspaceLock = {
      async run<T>(_key: string, task: () => Promise<T>, lockTimeoutMs?: number): Promise<T> {
        seen.push(lockTimeoutMs)
        return task()
      },
      lockPath: (key: string) => key,
    }

    const queue = createWorkspaceQueue({ lock })
    await queue.run('ws', async () => 'a', 250)
    await queue.run('ws', async () => 'b')

    expect(seen).toEqual([250, undefined])
  })

  it('锁获取失败：错误原样透出，且不阻断后续排队者', async () => {
    let calls = 0
    const lock: WorkspaceLock = {
      async run<T>(key: string, task: () => Promise<T>): Promise<T> {
        calls += 1
        if (calls === 1)
          throw new WorkspaceLockTimeoutError(`workspace lock not acquired (key=${key})`)
        return task()
      },
      lockPath: (key: string) => key,
    }

    const queue = createWorkspaceQueue({ lock })
    await expect(queue.run('ws', async () => 'never')).rejects.toBeInstanceOf(WorkspaceLockTimeoutError)
    await expect(queue.run('ws', async () => 'ok')).resolves.toBe('ok')
    await tick(5)
    expect(queue.size()).toBe(0)
  })

  it('大小写折叠后同一条道：Windows 上不许分裂出两条并发道', async () => {
    // 折叠只在 Windows 发生：断言按平台取反，避免在大小写敏感平台上假装成立。
    const folded = process.platform === 'win32'
    const queue = createWorkspaceQueue()
    const events: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = queue.run('C:/Repo', async () => {
      events.push('upper:start')
      await gate
      events.push('upper:end')
    })
    await tick(20)
    const second = queue.run('c:/repo', async () => {
      events.push('lower')
    })
    await tick(30)

    if (folded)
      expect(events).toEqual(['upper:start'])
    else
      expect(events).toEqual(['upper:start', 'lower'])

    release()
    await Promise.all([first, second])
    expect(events).toEqual(folded
      ? ['upper:start', 'upper:end', 'lower']
      : ['upper:start', 'lower', 'upper:end'])
  })
})
