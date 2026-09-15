import type { TurnRecord } from '../types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'pathe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDshHome, testDshHome } from '../../../../.test/test-utils'
import { LEDGER_VERSION, MAX_TURN_RECORDS, MAX_TURNS_PER_SESSION, REASON_EXPIRED } from '../constants'
import {
  blankLedger,
  ledgerPath,
  markTurnUndone,
  mutateLedger,
  readLedger,
  recordTurn,
  recordWorkspaceState,
  writeLedger,
} from './ledger'

vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})

function record(turn: number): TurnRecord {
  return {
    turn,
    beforeRef: `refs/turnrewind/s/${turn}/before`,
    afterRef: `refs/turnrewind/s/${turn}/after`,
    files: [],
    insertions: 0,
    deletions: 0,
    createdAt: turn,
    undoneAt: null,
    unavailable: null,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  resetTestDshHome()
})

describe('ledger', () => {
  it('round-trips a session ledger through the atomic writer', async () => {
    const ledger = blankLedger('session-1')
    ledger.workspaceRoot = 'C:/proj'
    ledger.isGit = true
    await writeLedger(ledger)
    const restored = await readLedger('session-1')
    expect(restored).toMatchObject({ sessionId: 'session-1', workspaceRoot: 'C:/proj', isGit: true })
    expect(restored.turns).toEqual([])
    // 文件确实是 JSON 文本（原子写落盘），并且按会话分文件落在 DSH_HOME 下。
    const raw = await readFile(ledgerPath('session-1'), 'utf8')
    expect(JSON.parse(raw).sessionId).toBe('session-1')
    expect(ledgerPath('session-1').startsWith(testDshHome.replaceAll('\\', '/'))).toBe(true)
  })

  it('records a turn and marks it undone', async () => {
    await recordTurn('session-2', record(1))
    await recordTurn('session-2', record(2))
    expect((await readLedger('session-2')).turns.map(turn => turn.turn)).toEqual([1, 2])
    expect(await markTurnUndone('session-2', 1, 1234)).toBe(true)
    expect((await readLedger('session-2')).turns[0]?.undoneAt).toBe(1234)
    // 未知 turn 不写入、不报错。
    expect(await markTurnUndone('session-2', 99, 1)).toBe(false)
  })

  it('keeps sessions isolated from each other', async () => {
    await recordTurn('session-a', record(1))
    await recordTurn('session-b', record(1))
    await writeLedger({ ...blankLedger('session-a'), isGit: true, workspaceRoot: 'C:/a' })
    expect((await readLedger('session-a')).workspaceRoot).toBe('C:/a')
    expect((await readLedger('session-b')).workspaceRoot).toBeNull()
  })

  it('falls back to an empty ledger on malformed or version-mismatched files', async () => {
    const path = ledgerPath('session-bad')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '{ not json', 'utf8')
    expect((await readLedger('session-bad')).turns).toEqual([])

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await writeFile(path, JSON.stringify({ ...blankLedger('session-bad'), version: LEDGER_VERSION + 1 }), 'utf8')
    const downgraded = await readLedger('session-bad')
    expect(downgraded.version).toBe(LEDGER_VERSION)
    expect(downgraded.turns).toEqual([])
  })

  it('把超出保留窗口的 turn 标记过期并回传其 refs（审计行保留）', async () => {
    const overflow = MAX_TURNS_PER_SESSION + 3
    const { refsToDelete } = await mutateLedger('session-retain', ledger => ({
      ...ledger,
      turns: Array.from({ length: overflow }, (_, index) => record(index + 1)),
    }))
    // 最老 3 条各自的 before/after ref 都要删（对象随之可被 prune 回收）。
    expect(refsToDelete).toHaveLength(6)
    const stored = await readLedger('session-retain')
    // 过期只锁执行、不抹审计：行还在、计数还在，但文件明细与 refs 已清空。
    expect(stored.turns).toHaveLength(overflow)
    expect(stored.turns[0]?.turn).toBe(1)
    expect(stored.turns[0]?.expiredAt).toBeTypeOf('number')
    expect(stored.turns[0]?.unavailable).toBe(REASON_EXPIRED)
    expect(stored.turns[0]?.files).toEqual([])
    expect(stored.turns[0]?.beforeRef).toBe('')
    expect(stored.turns.at(-1)?.expiredAt ?? null).toBeNull()
  })

  it('超过硬上限的最老审计行被真正丢弃', async () => {
    const overflow = MAX_TURN_RECORDS + 5
    await mutateLedger('session-cap', ledger => ({
      ...ledger,
      turns: Array.from({ length: overflow }, (_, index) => record(index + 1)),
    }))
    const stored = await readLedger('session-cap')
    expect(stored.turns).toHaveLength(MAX_TURN_RECORDS)
    expect(stored.turns[0]?.turn).toBe(overflow - MAX_TURN_RECORDS + 1)
    expect(stored.turns.at(-1)?.turn).toBe(overflow)
  })

  it('serializes concurrent load-modify-save so no update is lost', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, index) => recordTurn('session-lock', record(index + 1))))
    expect((await readLedger('session-lock')).turns.map(turn => turn.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('only writes the workspace state when it actually changes', async () => {
    await recordWorkspaceState('session-ws', { workspaceRoot: 'C:/p', isGit: true, unavailableReason: null })
    const before = JSON.stringify(await readLedger('session-ws'))
    await recordWorkspaceState('session-ws', { workspaceRoot: 'C:/p', isGit: true, unavailableReason: null })
    // 幂等：重复的同一结论不产生新的写入（内容一致）。
    expect(JSON.stringify(await readLedger('session-ws'))).toBe(before)
  })
})
