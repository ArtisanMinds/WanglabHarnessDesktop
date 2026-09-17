/**
 * apply.test.ts — 装配入口的回归测试（broke-once 防线）。
 *
 * `5b3b9534` 重建时 `client/apply.ts` 连同四个注册器被整体删除，宿主侧发送方
 * （`src/layout/components/webview.tsx`、`iframe.tsx`）原地保留，结果「壳的收起侧边栏」
 * 等控件全部空转。这里锁住四条 effect 都被登记，且登记过程确实挂上了父窗口桥监听。
 */
import type { ClientContext } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from './apply'

// effect 标签是 `ctx.effect` 的卸载日志标识：与 `client/apply.ts` 逐字一致。
const EXPECTED_LABELS = [
  'dsh-tauri: style (sidebar background)',
  'dsh-tauri: sidebar (toggle command + collapsed report)',
  'dsh-tauri: navigation (new session, add workspace)',
  'dsh-tauri: zoom shortcuts (ctrl/cmd +/-/0)',
  'dsh-tauri: sidebar tweaks (hide collapse toggle, center brand)',
]

/** 假 MutationObserver：只保证 controller.observe 可用。 */
class FakeMutationObserver {
  constructor(_callback: MutationCallback) {}

  observe(): void {}

  disconnect(): void {}

  takeRecords(): MutationRecord[] {
    return []
  }
}

interface Harness {
  labels: string[]
  windowListeners: () => number
  documentListeners: () => number
}

/** 装上 DOM 假实现（node 环境无 jsdom）。 */
function stubEnv(): Harness {
  const windowListeners = new Set<unknown>()
  const documentListeners = new Set<unknown>()
  const parent = { postMessage: () => {} }
  vi.stubGlobal('window', {
    parent,
    addEventListener: (_type: string, handler: unknown) => windowListeners.add(handler),
    removeEventListener: (_type: string, handler: unknown) => windowListeners.delete(handler),
  })
  vi.stubGlobal('document', {
    body: {},
    querySelector: () => null,
    addEventListener: (_type: string, handler: unknown) => documentListeners.add(handler),
    removeEventListener: (_type: string, handler: unknown) => documentListeners.delete(handler),
  })
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
  return {
    labels: [],
    windowListeners: () => windowListeners.size,
    documentListeners: () => documentListeners.size,
  }
}

/** 最小客户端 ctx：effect 按 cordis 的 `callback.call(fiber)` 语义绑定 this。 */
function fakeCtx(labels: string[]): ClientContext {
  return {
    effect(callback: (this: unknown) => () => void, label?: string) {
      if (label !== undefined)
        labels.push(label)
      callback.call(this)
      return () => {}
    },
    layout: { toggleSidebar: () => {} },
  } as unknown as ClientContext
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apply', () => {
  it('登记四条 effect：侧边栏桥、导航命令、缩放快捷键、侧边栏微调', () => {
    const env = stubEnv()

    apply(fakeCtx(env.labels))

    expect(env.labels).toEqual(EXPECTED_LABELS)
    // 侧边栏桥 + 导航命令各挂一个父窗口消息监听；缩放快捷键挂一个 document 捕获监听。
    expect(env.windowListeners()).toBe(2)
    expect(env.documentListeners()).toBe(1)
  })
})
