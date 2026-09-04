/**
 * operation.test.ts — ensureWorktree 的 Git 来源与分支行为。
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { simpleGit } from 'simple-git'
import { afterEach, describe, expect, it } from 'vitest'
import { projectDirname } from './git.js'
import { computeHash, discardWorktree, ensureWorktree, worktreePath } from './operation.js'

const temporaryDirectories: string[] = []

async function git(cwd: string, args: string[]): Promise<string> {
  return (await simpleGit({ baseDir: cwd, trimmed: true }).raw(args)).trim()
}

async function createRepository(branch: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-operation-'))
  temporaryDirectories.push(root)
  await git(root, ['init', '-b', branch])
  await writeFile(join(root, 'value.txt'), `${branch}\n`)
  await git(root, ['add', 'value.txt'])
  await git(root, [
    '-c',
    'user.name=DSH Test',
    '-c',
    'user.email=dsh-test@example.invalid',
    'commit',
    '-m',
    'initial',
  ])
  return root
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('ensureWorktree', () => {
  it('creates detached worktrees from refs/heads/main even when source HEAD differs', async () => {
    const repository = await createRepository('main')
    const mainHead = await git(repository, ['rev-parse', 'refs/heads/main'])
    await git(repository, ['checkout', '-b', 'feature'])
    await writeFile(join(repository, 'value.txt'), 'feature\n')
    await git(repository, ['add', 'value.txt'])
    await git(repository, [
      '-c',
      'user.name=DSH Test',
      '-c',
      'user.email=dsh-test@example.invalid',
      'commit',
      '-m',
      'feature',
    ])

    const worktreesRoot = await mkdtemp(join(tmpdir(), 'dsh-worktrees-root-'))
    temporaryDirectories.push(worktreesRoot)
    const result = await ensureWorktree({}, worktreesRoot, repository, 'detached-session')

    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(await git(result.binding.worktreePath, ['rev-parse', 'HEAD'])).toBe(mainHead)
    expect((await readFile(join(result.binding.worktreePath, 'value.txt'), 'utf8')).replaceAll('\r\n', '\n')).toBe('main\n')
    expect(result.binding.branchName).toBe('(detached)')

    await expect(discardWorktree({}, worktreesRoot, { sessionId: 'detached-session' })).resolves.toMatchObject({ ok: true })
  })

  it('creates -b worktrees from main while preserving branch-name conflict checks', async () => {
    const repository = await createRepository('main')
    const mainHead = await git(repository, ['rev-parse', 'refs/heads/main'])
    await git(repository, ['checkout', '-b', 'feature'])
    await writeFile(join(repository, 'value.txt'), 'feature\n')
    await git(repository, ['add', 'value.txt'])
    await git(repository, [
      '-c',
      'user.name=DSH Test',
      '-c',
      'user.email=dsh-test@example.invalid',
      'commit',
      '-m',
      'feature',
    ])

    const worktreesRoot = await mkdtemp(join(tmpdir(), 'dsh-worktrees-root-'))
    temporaryDirectories.push(worktreesRoot)
    const created = await ensureWorktree({}, worktreesRoot, repository, 'branch-session', { branchName: 'topic-main-source' })

    expect(created.ok).toBe(true)
    if (!created.ok)
      return
    expect(created.binding.branchName).toBe('dsh/topic-main-source')
    expect(await git(created.binding.worktreePath, ['rev-parse', 'HEAD'])).toBe(mainHead)
    expect((await readFile(join(created.binding.worktreePath, 'value.txt'), 'utf8')).replaceAll('\r\n', '\n')).toBe('main\n')

    const conflict = await ensureWorktree({}, worktreesRoot, repository, 'other-session', { branchName: 'topic-main-source' })
    expect(conflict).toEqual({ ok: false, error: '分支已存在：dsh/topic-main-source' })
    await expect(discardWorktree({}, worktreesRoot, { sessionId: 'branch-session' })).resolves.toMatchObject({ ok: true })
  }, 15_000)

  it('recreates over a directory-only orphan (state B) before adding', async () => {
    const repository = await createRepository('main')
    const worktreesRoot = await mkdtemp(join(tmpdir(), 'dsh-worktrees-root-'))
    temporaryDirectories.push(worktreesRoot)
    const hash = computeHash(repository, 'state-b-session')
    const orphan = worktreePath(worktreesRoot, hash, projectDirname(repository))
    await mkdir(join(orphan, 'residue'), { recursive: true })
    await writeFile(join(orphan, 'residue', 'old.txt'), 'stale')

    const result = await ensureWorktree({}, worktreesRoot, repository, 'state-b-session')

    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(existsSync(join(orphan, 'residue'))).toBe(false)
    expect(await git(result.binding.worktreePath, ['rev-parse', 'HEAD'])).not.toBe('')
    await expect(discardWorktree({}, worktreesRoot, { sessionId: 'state-b-session' })).resolves.toMatchObject({ ok: true })
  }, 15_000)

  it('fails clearly before creating a worktree when refs/heads/main is absent', async () => {
    const repository = await createRepository('develop')
    const worktreesRoot = await mkdtemp(join(tmpdir(), 'dsh-worktrees-root-'))
    temporaryDirectories.push(worktreesRoot)

    const result = await ensureWorktree({}, worktreesRoot, repository, 'missing-main-session')

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('refs/heads/main'),
    })
    expect(result.ok).toBe(false)
    expect(existsSync(worktreePath(worktreesRoot, computeHash(repository, 'missing-main-session'), projectDirname(repository))))
      .toBe(false)
  })
})
