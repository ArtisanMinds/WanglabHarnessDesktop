/**
 * register/new-session.test.ts — 侧边栏「新建会话」默认落到「未分组」的回归测试。
 *
 * 锁住的契约：命中官方按钮时必须在**捕获阶段**吞掉这次点击（`preventDefault` +
 * `stopImmediatePropagation`，否则 React 根容器上的官方 `startSession()` 照常执行），
 * 并改走未分组新建；未命中的按钮（工作区分组行的「+」）一个副作用都不产生。
 */
import type { ClientContext } from 'dsh-tauri/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sidebarNewSessionFeature } from './new-session'

const mocks = vi.hoisted(() => ({
  startUngroupedSession: vi.fn(),
  controller: undefined as unknown,
}))

vi.mock('../service/ungrouped-session', () => ({ startUngroupedSession: mocks.startUngroupedSession }))

vi.mock('dsh-tauri/client', () => {
  const createLifecycleController = () => {
    const disposers: Array<() => void> = []
    let clickHandler: ((event: unknown) => void) | undefined
    let clickOptions: unknown
    return {
      add: (disposer: () => void) => {
        disposers.push(disposer)
      },
      listen: (_type: string, handler: (event: unknown) => void, options?: unknown) => {
        clickHandler = handler
        clickOptions = options
        return () => {}
      },
      observe: () => ({ disconnect: () => {} }),
      isDisposed: () => false,
      dispose: () => {
        clickHandler = undefined
        for (const disposer of [...disposers])
          disposer()
        disposers.length = 0
      },
      click: (event: unknown) => clickHandler?.(event),
      clickOptions: () => clickOptions,
    }
  }
  return {
    defineRegister: (ctxOrSetup: unknown, maybeSetup?: unknown) => {
      const setup = (typeof maybeSetup === 'function' ? maybeSetup : ctxOrSetup) as
        (controller: unknown, ctx: unknown, adapter: unknown) => void
      return function registerEffect(this: unknown) {
        const controller = createLifecycleController()
        mocks.controller = controller
        setup(controller, this, {})
        return () => controller.dispose()
      }
    },
  }
})

interface ControllerStub {
  click: (event: unknown) => void
  clickOptions: () => unknown
  dispose: () => void
}

class FakeElement {
  closest: (selector: string) => FakeButton | null = () => null
}

class FakeButton extends FakeElement {
  constructor(private readonly label: string | null) {
    super()
  }

  getAttribute(name: string): string | null {
    return name === 'aria-label' ? this.label : null
  }
}

/** 官方按钮本体（自己就是最近的 `button[aria-label]`）。 */
function buttonTarget(label: string | null): FakeElement {
  const button = new FakeButton(label)
  button.closest = selector => selector === 'button[aria-label]' ? button : null
  return button
}

/** 按钮内部节点：最近的 `button[aria-label]` 是外层官方按钮。 */
function childTarget(button: FakeButton): FakeElement {
  const child = new FakeElement()
  child.closest = selector => selector === 'button[aria-label]' ? button : null
  return child
}

function clickEvent(target: unknown) {
  return {
    target,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  }
}

const ctx = {} as ClientContext

beforeEach(() => {
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('document', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sidebarNewSessionFeature', () => {
  it('捕获阶段吞掉官方「新建会话」点击并改走未分组新建', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub
    expect(controller.clickOptions(), '必须用捕获阶段：document 捕获先于 React 根容器的官方处理器')
      .toEqual({ capture: true })

    const event = clickEvent(buttonTarget('新建会话'))
    controller.click(event)

    expect(event.preventDefault, '官方默认分支必须被拦下').toHaveBeenCalledTimes(1)
    expect(event.stopImmediatePropagation, '官方 onClick 挂在 React 根容器上，必须阻断传播').toHaveBeenCalledTimes(1)
    expect(mocks.startUngroupedSession).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('按钮内部节点点击同样命中（最近的 button[aria-label] 是官方按钮）', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub

    controller.click(clickEvent(childTarget(new FakeButton('New session'))))

    expect(mocks.startUngroupedSession).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('工作区分组行的「+」不命中：不拦点击、不建会话', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub

    const event = clickEvent(buttonTarget('在“dsh-tauri-desktop”中新建会话'))
    controller.click(event)

    expect(event.preventDefault, '分组行的行为必须保持不变').not.toHaveBeenCalled()
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled()
    expect(mocks.startUngroupedSession).not.toHaveBeenCalled()
    dispose()
  })

  it('英雄区工作区 chip 不命中', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub

    controller.click(clickEvent(buttonTarget('选择工作区')))

    expect(mocks.startUngroupedSession).not.toHaveBeenCalled()
    dispose()
  })

  it('非 Element 目标不命中', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub

    controller.click(clickEvent({ not: 'an element' }))

    expect(mocks.startUngroupedSession).not.toHaveBeenCalled()
    dispose()
  })

  it('dispose 后不再响应点击', () => {
    const dispose = sidebarNewSessionFeature.call(ctx)
    const controller = mocks.controller as ControllerStub
    dispose()

    controller.click(clickEvent(buttonTarget('新建会话')))

    expect(mocks.startUngroupedSession).not.toHaveBeenCalled()
  })
})
