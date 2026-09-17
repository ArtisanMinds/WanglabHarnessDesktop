import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSettingsFilePath } from './paths'

describe('resolveSettingsFilePath', () => {
  it('uses a non-blank DSH_HOME', () => {
    expect(resolveSettingsFilePath({ DSH_HOME: 'D:\\harness' } as NodeJS.ProcessEnv))
      .toBe(resolve('D:\\harness', 'settings.yaml'))
  })

  it('falls back to ~/.dsh when DSH_HOME is unset or blank', () => {
    const expected = join(homedir(), '.dsh', 'settings.yaml')
    expect(resolveSettingsFilePath({} as NodeJS.ProcessEnv)).toBe(expected)
    expect(resolveSettingsFilePath({ DSH_HOME: '   ' } as NodeJS.ProcessEnv)).toBe(expected)
  })

  it('expands a leading tilde', () => {
    expect(resolveSettingsFilePath({ DSH_HOME: '~/custom' } as NodeJS.ProcessEnv))
      .toBe(join(homedir(), 'custom', 'settings.yaml'))
  })
})
