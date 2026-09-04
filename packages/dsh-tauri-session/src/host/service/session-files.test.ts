import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { locateSessionDataDir, removeSessionDataDir, resolveSessionGroupDirectory } from './session-files'

let dshHome = ''

beforeEach(() => {
  dshHome = mkdtempSync(join(tmpdir(), 'dsh-session-files-'))
})

afterEach(() => {
  rmSync(dshHome, { recursive: true, force: true })
})

function makeSessionDir(group: string | undefined, marker: string): string {
  const dir = group ? join(dshHome, 'sessions', group, marker) : join(dshHome, 'sessions', marker)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('locateSessionDataDir', () => {
  it('finds a depth-2 session data directory (sessions/<group>/session-<id>)', () => {
    const dir = makeSessionDir('--project-a--', 'session-abc')
    expect(locateSessionDataDir(dshHome, 'abc')).toBe(dir)
  })

  it('finds a depth-1 session data directory (sessions/session-<id>)', () => {
    const dir = makeSessionDir(undefined, 'session-xyz')
    expect(locateSessionDataDir(dshHome, 'xyz')).toBe(dir)
  })

  it('returns undefined when no session data directory exists', () => {
    expect(locateSessionDataDir(dshHome, 'missing')).toBeUndefined()
  })
})

describe('resolveSessionGroupDirectory', () => {
  it('opens the shared project directory when all sessions live in one group', () => {
    makeSessionDir('--project-a--', 'session-abc')
    makeSessionDir('--project-a--', 'session-def')
    expect(resolveSessionGroupDirectory(dshHome, ['abc', 'def'])).toBe(join(dshHome, 'sessions', '--project-a--'))
  })

  it('falls back to the sessions root when sessions span multiple project directories', () => {
    makeSessionDir('--project-a--', 'session-abc')
    makeSessionDir('--project-b--', 'session-def')
    expect(resolveSessionGroupDirectory(dshHome, ['abc', 'def'])).toBe(join(dshHome, 'sessions'))
  })

  it('returns undefined when no session in the group has data on disk', () => {
    expect(resolveSessionGroupDirectory(dshHome, ['ghost'])).toBeUndefined()
  })
})

describe('removeSessionDataDir (regression: shared scan)', () => {
  it('removes the located depth-2 directory', () => {
    makeSessionDir('--project-a--', 'session-abc')
    expect(removeSessionDataDir(dshHome, 'abc')).toBe(true)
    expect(locateSessionDataDir(dshHome, 'abc')).toBeUndefined()
  })

  it('reports false when the session has no data directory', () => {
    expect(removeSessionDataDir(dshHome, 'ghost')).toBe(false)
  })
})
