/**
 * operation.test.ts — ensureWorktree 的 Git 来源与分支行为。
 *
 * 工作树落在 `DSH_HOME` 下，测试用 `vi.mock('dsh-tauri')` 换成临时目录
 * （见 ../test-utils.ts）。
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { simpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDshHome, testDshHome } from '../../../../.test/test-utils'
import { projectDirname } from './git'
import { computeHash, discardWorktree, ensureWorktree, worktreePath } from './operation'

vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})

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

beforeEach(() => {
  resetTestDshHome()
})

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

/**
 * Mimic the cordis host ctx (see @deepseek-ai/cordis): reading a property that
 * was never injected throws `cannot get property "X" without inject`, while
 * optional host services are reachable through `ctx.get(name)`.
 */
function injectingCtx(services: Record<string, unknown> = {}): Record<string, unknown> {
  const target: Record<string, unknown> = {
    get(name: string): unknown {
      return services[name]
    },
  }
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t)
        return Reflect.get(t, prop, receiver)
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
}

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

    const result = await ensureWorktree({}, repository, 'detached-session')

    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(await git(result.binding.worktreePath, ['rev-parse', 'HEAD'])).toBe(mainHead)
    expect((await readFile(join(result.binding.worktreePath, 'value.txt'), 'utf8')).replaceAll('\r\n', '\n')).toBe('main\n')
    expect(result.binding.branchName).toBe('(detached)')

    await expect(discardWorktree({}, { sessionId: 'detached-session' })).resolves.toMatchObject({ ok: true })
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

    const created = await ensureWorktree({}, repository, 'branch-session', { branchName: 'topic-main-source' })

    expect(created.ok).toBe(true)
    if (!created.ok)
      return
    expect(created.binding.branchName).toBe('dsh/topic-main-source')
    expect(await git(created.binding.worktreePath, ['rev-parse', 'HEAD'])).toBe(mainHead)
    expect((await readFile(join(created.binding.worktreePath, 'value.txt'), 'utf8')).replaceAll('\r\n', '\n')).toBe('main\n')

    const conflict = await ensureWorktree({}, repository, 'other-session', { branchName: 'topic-main-source' })
    expect(conflict).toEqual({ ok: false, error: '分支已存在：dsh/topic-main-source' })
    await expect(discardWorktree({}, { sessionId: 'branch-session' })).resolves.toMatchObject({ ok: true })
  }, 15_000)

  it('recreates over a directory-only orphan (state B) before adding', async () => {
    const repository = await createRepository('main')
    const hash = computeHash(repository, 'state-b-session')
    const orphan = worktreePath(hash, projectDirname(repository))
    await mkdir(join(orphan, 'residue'), { recursive: true })
    await writeFile(join(orphan, 'residue', 'old.txt'), 'stale')

    const result = await ensureWorktree({}, repository, 'state-b-session')

    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(existsSync(join(orphan, 'residue'))).toBe(false)
    expect(await git(result.binding.worktreePath, ['rev-parse', 'HEAD'])).not.toBe('')
    await expect(discardWorktree({}, { sessionId: 'state-b-session' })).resolves.toMatchObject({ ok: true })
  }, 15_000)

  it('fails clearly before creating a worktree when refs/heads/main is absent', async () => {
    const repository = await createRepository('develop')

    const result = await ensureWorktree({}, repository, 'missing-main-session')

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('refs/heads/main'),
    })
    expect(result.ok).toBe(false)
    expect(existsSync(worktreePath(computeHash(repository, 'missing-main-session'), projectDirname(repository))))
      .toBe(false)
  })

  it('stops worktree processes via ctx.get before discarding on a cordis-style ctx', async () => {
    const repository = await createRepository('main')
    const created = await ensureWorktree({}, repository, 'ctx-controller-session')
    expect(created.ok).toBe(true)
    if (!created.ok)
      return

    const stopped: string[] = []
    const ctx = injectingCtx({
      worktreeProcessController: {
        stopSessionProcesses: (sessionId: string, worktreePath: string) => {
          stopped.push(`${sessionId}:${worktreePath}`)
          return Promise.resolve()
        },
      },
    })

    const result = await discardWorktree(ctx, { sessionId: 'ctx-controller-session' })

    expect(result.ok).toBe(true)
    expect(existsSync(created.binding.worktreePath)).toBe(false)
    expect(stopped).toEqual([`ctx-controller-session:${created.binding.worktreePath}`])
  })

  it('discards even when the host ctx has no worktreeProcessController service (regression)', async () => {
    const repository = await createRepository('main')
    const created = await ensureWorktree({}, repository, 'ctx-probe-session')
    expect(created.ok).toBe(true)
    if (!created.ok)
      return

    // A cordis ctx whose uninjected property read throws used to make the
    // controller probe fail and leave the worktree on disk forever.
    const result = await discardWorktree(injectingCtx(), { sessionId: 'ctx-probe-session' })

    expect(result.ok).toBe(true)
    expect(existsSync(created.binding.worktreePath)).toBe(false)
  })

  it('removes the emptied worktrees/<hash> and .trash/<hash> containers along with the worktree', async () => {
    const repository = await createRepository('main')
    const created = await ensureWorktree({}, repository, 'container-cleanup-session')
    expect(created.ok).toBe(true)
    if (!created.ok)
      return

    const container = join(testDshHome, 'worktrees', created.binding.hash)
    const trashContainer = join(testDshHome, '.trash', created.binding.hash)
    expect(existsSync(container)).toBe(true)

    const result = await discardWorktree({}, { sessionId: 'container-cleanup-session' })

    expect(result.ok).toBe(true)
    expect(existsSync(created.binding.worktreePath)).toBe(false)
    // 删除后不再残留空的 <hash> 容器目录（含 .trash 一侧的 rename 中间目录）。
    expect(existsSync(container)).toBe(false)
    expect(existsSync(trashContainer)).toBe(false)
  })

  it('links source dependency directories into the worktree and unlinks before discard', async () => {
    const repository = await createRepository('main')
    const dependency = join(repository, 'node_modules', 'pkg', 'index.js')
    await mkdir(join(repository, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(dependency, 'shared-dependency\n')

    const created = await ensureWorktree({}, repository, 'linked-session')

    expect(created.ok).toBe(true)
    if (!created.ok)
      return
    expect(created.binding.linkedDependencies).toEqual(['node_modules'])
    const link = join(created.binding.worktreePath, 'node_modules')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(link, 'pkg', 'index.js'), 'utf8')).toBe('shared-dependency\n')

    await expect(discardWorktree({}, { sessionId: 'linked-session' })).resolves.toMatchObject({ ok: true })
    // 删除工作树只能摘链接，绝不能穿透链接删掉源仓库的 node_modules。
    expect(readFileSync(dependency, 'utf8')).toBe('shared-dependency\n')
  })

  it('skips dependency linking when linkDependencies is false', async () => {
    const repository = await createRepository('main')
    await mkdir(join(repository, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(repository, 'node_modules', 'pkg', 'index.js'), 'shared-dependency\n')

    const created = await ensureWorktree({}, repository, 'unlinked-session', { linkDependencies: false })

    expect(created.ok).toBe(true)
    if (!created.ok)
      return
    expect(created.binding.linkedDependencies).toBeUndefined()
    expect(existsSync(join(created.binding.worktreePath, 'node_modules'))).toBe(false)
  })
})
