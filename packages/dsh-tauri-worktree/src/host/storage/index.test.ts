/**
 * host/storage/index.test.ts — 按会话分文件的 binding ledger 契约：
 * 独立读写互不干扰、单会话删除、按会话枚举。
 *
 * 数据根固定为 `DSH_HOME`，测试用 `vi.mock('dsh-tauri')` 换成临时目录
 * （见 host/test-utils.ts）。
 */

import type { Binding } from '../types'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBindings, loadBinding, removeBinding, saveBinding } from '.'
import { resetTestDshHome, testDshHome } from '../../../../.test/test-utils'

vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})

beforeEach(() => {
  resetTestDshHome()
})

function makeBinding(sessionId: string, hash = 'hash-a'): Binding {
  return {
    sessionId,
    sourceSessionId: 'source-a',
    hash,
    dirname: 'repo',
    worktreePath: join(tmpdir(), `wt-${sessionId}`),
    projectPath: '/tmp/repo',
    branchName: 'dsh/x',
    ownsBranch: true,
    createdAt: new Date().toISOString(),
    log: [],
  }
}

describe('按会话分文件的 binding ledger', () => {
  it('saveBinding/loadBinding 往返一致', async () => {
    const binding = makeBinding('session-1')
    await saveBinding('session-1', binding)
    expect(loadBinding('session-1')).toEqual(binding)
  })

  it('同组不同会话各自读写互不干扰；覆盖只作用于自己的文件', async () => {
    const a = makeBinding('session-a', 'hash-a')
    const b = makeBinding('session-b', 'hash-b')
    await saveBinding('session-a', a)
    await saveBinding('session-b', b)
    await saveBinding('session-a', { ...a, branchName: 'dsh/updated' })

    expect(loadBinding('session-a')).toMatchObject({ branchName: 'dsh/updated' })
    expect(loadBinding('session-b')).toEqual(b)
    // 未写入的会话读不到（不因别人写入而串扰）。
    expect(loadBinding('session-none')).toBeNull()
  })

  it('removeBinding 只删指定会话，其余保留', async () => {
    await saveBinding('session-a', makeBinding('session-a'))
    await saveBinding('session-b', makeBinding('session-b'))
    await removeBinding('session-a')

    expect(loadBinding('session-a')).toBeNull()
    expect(loadBinding('session-b')).toMatchObject({ sessionId: 'session-b' })
    // 再次删除不存在项视为成功。
    await expect(removeBinding('session-a')).resolves.toBeUndefined()
  })

  it('listBindings 枚举当前全部绑定', async () => {
    await saveBinding('session-x', makeBinding('session-x', 'hash-x'))
    await saveBinding('session-y', makeBinding('session-y', 'hash-y'))

    expect(listBindings().map(b => b.sessionId).sort()).toEqual(['session-x', 'session-y'])
    expect(readdirSync(join(testDshHome, 'ledger')).sort()).toEqual(['session-x.json', 'session-y.json'])
  })

  it('无 ledger/ 目录时读取与枚举均安全', () => {
    expect(loadBinding('any')).toBeNull()
    expect(listBindings()).toEqual([])
    expect(existsSync(join(testDshHome, 'ledger'))).toBe(false)
  })

  it('损坏的 ledger 文件按无绑定处理，不阻断其余会话', async () => {
    await saveBinding('session-good', makeBinding('session-good'))
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(testDshHome, 'ledger', 'session-broken.json'), '{ not json')

    expect(loadBinding('session-broken')).toBeNull()
    expect(listBindings().map(b => b.sessionId)).toEqual(['session-good'])
  })
})
