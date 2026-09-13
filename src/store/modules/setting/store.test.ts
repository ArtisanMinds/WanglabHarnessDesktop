import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({
  stored: {} as Record<string, unknown> | string,
  listeners: new Set<(event: { payload: unknown }) => void | Promise<void>>(),
}))

function savedSetting(): Record<string, unknown> {
  return typeof backend.stored === 'string' ? JSON.parse(backend.stored) : structuredClone(backend.stored)
}

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => structuredClone(backend.stored)),
      set: vi.fn(async (_key: string, value: Record<string, unknown> | string) => { backend.stored = structuredClone(value) }),
    })),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, args?: { preferences: Record<string, unknown> }) => {
    const current = savedSetting()
    if (command === 'get_app_config')
      return current
    if (command === 'save_frontend_preferences') {
      for (const key of ['zoom_factor', 'language']) {
        if (args?.preferences[key] != null)
          current[key] = args.preferences[key]
      }
      backend.stored = current
      return current
    }
    throw new Error(`Unexpected command: ${command}`)
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void | Promise<void>) => {
    backend.listeners.add(handler)
    return () => backend.listeners.delete(handler)
  }),
}))

let setting: typeof import('./store').setting

beforeEach(async () => {
  vi.resetModules()
  backend.listeners.clear()
  backend.stored = {
    installed: true,
    port: 3080,
    auto_start: true,
    language: 'en-US',
    zoom_factor: 1,
    active_core: 'app',
    dsh_pkg_tag: 'dsh-0.1.2-rc.1-wanglab032',
    dsh_pkg_commit: 'previous-core-commit',
    active_profile: 'work',
    desktop_profile_ready: true,
    pet_enabled: false,
    active_pet: null,
  }
  const module = await import('./store')
  setting = module.setting
  await setting.$persist.rehydrate()
  await new Promise(resolve => setTimeout(resolve, 0))
})

afterEach(() => setting.$persist.dehydrate())

describe('settings during Core upgrade', () => {
  it('preserves the installed Core and profile when a stale frontend snapshot is persisted', async () => {
    backend.stored = {
      ...savedSetting(),
      dsh_pkg_tag: 'dsh-0.1.5-rc.2-wanglab040',
      dsh_pkg_commit: 'paired-core-commit',
      active_profile: 'research',
      pet_enabled: true,
      active_pet: 'chat:nimbus',
    }

    setting.zoom_factor = 1.2

    await vi.waitFor(() => expect(savedSetting().zoom_factor).toBe(1.2))
    expect(savedSetting()).toMatchObject({
      installed: true,
      dsh_pkg_tag: 'dsh-0.1.5-rc.2-wanglab040',
      dsh_pkg_commit: 'paired-core-commit',
      active_profile: 'research',
      desktop_profile_ready: true,
      pet_enabled: true,
      active_pet: 'chat:nimbus',
    })
  })

  it('refreshes from current backend settings after every event, including delayed events', async () => {
    const stale = savedSetting()
    for (const handler of [...backend.listeners])
      await handler({ payload: stale })

    backend.stored = { ...savedSetting(), port: 3082, installed: false }
    for (const handler of [...backend.listeners])
      await handler({ payload: stale })

    await vi.waitFor(() => expect(setting.port).toBe(3082))
    expect(setting.installed).toBe(false)
    expect(savedSetting().port).toBe(3082)
  })
})
