/**
 * panel-list.test.ts — 官方 `sidebar.panellist` 行投影服务。
 *
 * 覆盖三件容易回归的事：
 *   1. order 升序 + thunk 文案读时求值 + 缺 label 回退 id；
 *   2. 结构未变时**不写 store**（entriesOfSlot 每次返回新数组，必须比内容；
 *      store 换成 valtio-define 后这条同样成立：不写入则快照引用不变）；
 *   3. 旧核心 slots 服务没有投影能力时 store 恒为空表（克隆侧栏不渲染清单）。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { describe, expect, it, vi } from 'vitest'
import { PANEL_LIST_SLOT } from '../constants'
import { createPanelList } from './panel-list'

// dsh-tauri 的 dist bundle 以 `window.__ModuleLoader__.load(...)` 包裹，脱离宿主
// 加载器后无法在 node 环境求值；只 mock 被测服务实际消费的工厂（defineStore /
// defineRegister），用最小实现还原两者的可观察契约。
vi.mock('dsh-tauri/client', () => {
  const createMockController = () => {
    const disposers: Array<() => void> = []
    let disposed = false
    return {
      add: (disposer: () => void) => {
        disposers.push(disposer)
        return () => {}
      },
      timeout: () => () => {},
      interval: () => () => {},
      listen: () => () => {},
      observe: () => undefined,
      isDisposed: () => disposed,
      dispose: () => {
        disposed = true
        for (const disposer of disposers.splice(0))
          disposer()
      },
    }
  }

  // valtio-define 的最小替身：state 为可变对象，actions 绑定到该对象。
  const createMockStore = (options: unknown): Record<string, unknown> => {
    const { state, actions } = options as {
      state: () => Record<string, unknown>
      actions?: Record<string, (...args: unknown[]) => unknown>
    }
    const store = state()
    for (const [key, action] of Object.entries(actions ?? {}))
      store[key] = (...args: unknown[]) => Reflect.apply(action, store, args)
    return store
  }

  // defineRegister 的最小替身：运行 setup、登记返回值、返回 dispose 句柄。
  const createMockRegister = (ctxOrSetup: unknown, maybeSetup?: unknown) => {
    const boundCtx = typeof maybeSetup === 'function' ? ctxOrSetup : undefined
    const setup = (typeof maybeSetup === 'function' ? maybeSetup : ctxOrSetup) as (
      controller: ReturnType<typeof createMockController>,
      ctx: unknown,
      adapter: unknown,
    ) => unknown
    return function registerEffect(this: unknown): () => void {
      const controller = createMockController()
      const cleanup = setup(controller, boundCtx ?? this, {})
      if (typeof cleanup === 'function') {
        controller.add(cleanup as () => void)
      }
      else if (Array.isArray(cleanup)) {
        for (const fn of cleanup) controller.add(fn as () => void)
      }
      return () => controller.dispose()
    }
  }

  return {
    defineStore: (options: unknown) => createMockStore(options),
    defineRegister: (ctxOrSetup: unknown, maybeSetup?: unknown) =>
      createMockRegister(ctxOrSetup, maybeSetup),
  }
})

interface FakeContext {
  ctx: ClientContext
  /** 触发槽位变化通知（模拟 slots.subscribe 的回调）。 */
  notifySlots: () => void
  /** 触发 locale 变化通知。 */
  notifyLocale: () => void
}

/**
 * 造一个带 slots 投影能力的 ctx。
 * @param initial - 初始条目；测试可通过 `runtime.entries` 换掉再 notify。
 * @param capable - false 时模拟旧核心（没有 entriesOfSlot / subscribe）。
 */
function createCtx(
  initial: Array<{ options: Record<string, unknown> }> = [],
  capable = true,
): FakeContext & { runtime: { entries: Array<{ options: Record<string, unknown> }> } } {
  const runtime = { entries: initial }
  const slotListeners = new Set<() => void>()
  const localeListeners = new Set<() => void>()
  const slots: Record<string, unknown> = {
    inject: () => () => {},
    register: () => () => {},
  }
  if (capable) {
    slots.entriesOfSlot = (key: string) => (key === PANEL_LIST_SLOT ? runtime.entries : [])
    slots.subscribe = (_key: string, listener: () => void) => {
      slotListeners.add(listener)
      return () => slotListeners.delete(listener)
    }
  }
  const ctx = {
    slots,
    locale: {
      register: () => () => {},
      getLocale: () => ({ active: 'zh' }),
      subscribe: (listener: () => void) => {
        localeListeners.add(listener)
        return () => localeListeners.delete(listener)
      },
    },
    // effect 立即执行并保留 disposer（与 cordis 的 effect 语义一致）。
    effect: (callback: () => void) => {
      callback()
    },
  } as unknown as ClientContext
  return {
    ctx,
    runtime,
    notifySlots: () => {
      for (const listener of [...slotListeners])
        listener()
    },
    notifyLocale: () => {
      for (const listener of [...localeListeners])
        listener()
    },
  }
}

describe('createPanelList 行投影', () => {
  it('按 order 升序，thunk 文案读时求值，缺 label 回退 id', () => {
    const { ctx } = createCtx([
      { options: { id: 'c', order: 30, label: 'Third' } },
      { options: { id: 'a', order: 10 } },
      { options: { id: 'b', order: 20, label: () => 'Second' } },
    ])
    const { store } = createPanelList(ctx)

    expect(store.rows).toEqual([
      { id: 'a', order: 10, label: 'a' },
      { id: 'b', order: 20, label: 'Second' },
      { id: 'c', order: 30, label: 'Third' },
    ])
  })

  it('order 缺省为 0；无 id 的条目被忽略', () => {
    const { ctx } = createCtx([
      { options: { id: 'has-order', order: 5, label: 'x' } },
      { options: { id: 'no-order', label: 'y' } },
      { options: { label: 'orphan' } },
    ])
    const { store } = createPanelList(ctx)

    expect(store.rows).toEqual([
      { id: 'no-order', order: 0, label: 'y' },
      { id: 'has-order', order: 5, label: 'x' },
    ])
  })

  it('结构未变时不写 store（entriesOfSlot 每次返回新数组，快照引用必须稳定）', () => {
    const { ctx, runtime, notifySlots } = createCtx([
      { options: { id: 'a', order: 1, label: 'A' } },
    ])
    const { store } = createPanelList(ctx)
    const first = store.rows

    // 换一批等价但不同引用的条目对象，再通知一次
    runtime.entries = [{ options: { id: 'a', order: 1, label: 'A' } }]
    notifySlots()

    expect(store.rows).toBe(first)
  })

  it('槽位变化后投影更新（新增条目进入清单）', () => {
    const { ctx, runtime, notifySlots } = createCtx()
    const { store } = createPanelList(ctx)
    expect(store.rows).toEqual([])

    runtime.entries = [{ options: { id: 'new', order: 7, label: 'New' } }]
    notifySlots()

    expect(store.rows).toEqual([{ id: 'new', order: 7, label: 'New' }])
  })

  it('locale 变化重新投影 thunk 文案（语言切换无需重新注册）', () => {
    let lang = 'zh'
    const { ctx, notifyLocale } = createCtx([
      { options: { id: 'a', order: 1, label: () => (lang === 'zh' ? '甲' : 'A') } },
    ])
    const { store } = createPanelList(ctx)
    expect(store.rows).toEqual([{ id: 'a', order: 1, label: '甲' }])

    lang = 'en'
    notifyLocale()

    expect(store.rows).toEqual([{ id: 'a', order: 1, label: 'A' }])
  })

  it('旧核心（slots 无投影能力）时 store 恒为空表，available=false', () => {
    const { ctx } = createCtx([{ options: { id: 'a', order: 1, label: 'A' } }], false)
    const service = createPanelList(ctx)

    expect(service.available).toBe(false)
    expect(service.store.rows).toEqual([])
  })
})
