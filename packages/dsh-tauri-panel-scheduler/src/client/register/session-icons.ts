/**
 * register/session-icons.ts — 侧边栏会话行给定时任务会话加时钟图标（DOM 补丁）。
 *
 * 机制与 dsh-tauri-worktree 的 register/session-icons.ts 一致：会话行由官方
 * WorkspaceBrowser（sidebar.workspaces 单槽）内部渲染，没有 per-row 注入槽，
 * 因此采用「零结构补丁」：注入一条 CSS + MutationObserver，按语义结构
 * （[role=treeitem]）定位行，在行内「时间标识」左侧插入一个时钟图标 span。
 *
 * 归属判定：`store.scheduler.runs` 携带的 sessionId 集合（执行记录与面板轮询刷新
 * 同步）。与 worktree 不同的一点：不用 `session-` 前缀过滤 Fiber key——
 * 官方行的 Fiber key 是裸 session id（原生 id 恰好以 session- 开头），而本插件
 * 自建会话 id 是 `task-<uuid>`，前缀过滤会漏掉自己的行；改为集合精确匹配，
 * 非会话行（工作区分组头等）天然不在集合内。
 *
 * 生命周期全部由 `defineRegister` 提供的 controller 托管（观察器 / 订阅 / 轮询
 * 在插件卸载时统一释放），本文件不再自建 controller。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { clockSvg, mountStyle } from 'dsh-tauri-ui/client'
import { defineRegister } from 'dsh-tauri/client'
import {
  SESSION_ICON_ATTRIBUTE,
  SESSION_ICON_STYLE_ID,
  SIDEBAR_SELECTOR,
} from '../constants'
import { store } from '../store'
import sessionIconStyle from '../styles/index.cssr'

/** React 挂在 DOM 节点上的私有 Fiber 引用（只读，绝不移动 React 管理的节点）。 */
interface FiberLike {
  key?: unknown
  return?: FiberLike | null
}

/**
 * HARDCODE: DSH 0.1.1-rc.2 does not expose a per-session-row slot or data id,
 * so read the private React Fiber key.
 */
function rowSessionId(element: Element): string | undefined {
  const fiberName = Object.keys(element).find(key => key.startsWith('__reactFiber$'))
  if (fiberName === undefined)
    return undefined
  // 私有字段没有公开类型：断言到「带索引签名的 Element」，只读取不写入。
  let fiber = (element as Element & Record<string, FiberLike | undefined>)[fiberName]
  for (let depth = 0; fiber && depth < 10; depth++, fiber = fiber.return ?? undefined) {
    if (typeof fiber.key === 'string')
      return fiber.key
  }
  return undefined
}

function sessionRows(): Map<string, Element> {
  const rows = new Map<string, Element>()
  for (const row of document.querySelectorAll<Element>('[role="treeitem"][aria-selected]')) {
    const id = rowSessionId(row)
    if (id)
      rows.set(id, row)
  }
  return rows
}

// HARDCODE: DSH 0.1.1-rc.2 SessionNodeItem children are status, title,
// time, rowActions. Anchor on rowActions instead of locale-dependent text;
// blank rows have no time, so never fall back to inserting before the title.
function applyIcon(row: Element): void {
  if (row.querySelector(`[${SESSION_ICON_ATTRIBUTE}]`))
    return
  const actions = row.lastElementChild
  const time = actions?.previousElementSibling
  if (!actions?.querySelector('button') || !time || time.querySelector('button'))
    return

  const icon = document.createElement('span')
  icon.setAttribute(SESSION_ICON_ATTRIBUTE, '1')
  icon.innerHTML = clockSvg(12)
  row.insertBefore(icon, time)
}

/** 全量扫描：只绘制/清除图标，不移动 React 管理的 DOM。 */
function scan(): void {
  const scheduled = new Set<string>()
  for (const run of store.scheduler.runs) {
    if (run.sessionId)
      scheduled.add(run.sessionId)
  }
  for (const [sessionId, row] of sessionRows()) {
    const icon = row.querySelector<HTMLElement>(`[${SESSION_ICON_ATTRIBUTE}]`)
    if (scheduled.has(sessionId)) {
      if (!icon)
        applyIcon(row)
    }
    else {
      icon?.remove()
    }
  }
}

/**
 * 会话行时钟图标 feature：CSS + DOM 观察器 + store 订阅 + 侧边栏出现前的短轮询。
 * 运行期：`ctx.effect(sessionIconsFeature, SESSION_ICONS_EFFECT)`。
 */
export const sessionIconsFeature = defineRegister<ClientContext>((controller) => {
  if (typeof document === 'undefined')
    return
  controller.add(mountStyle(sessionIconStyle, SESSION_ICON_STYLE_ID))

  // 观察 document.body（覆盖其后挂载的侧边栏子树），store 变更时重扫。
  // observe 的签名是 (target, onMutate, options?)：观察配置是第三参，省略即
  // { childList: true, subtree: true }。
  controller.observe(document.body, scan)
  controller.add(store.scheduler.$subscribe(scan))

  // 应用晚挂载时侧边栏可能尚未出现，短暂轮询直到侧边栏出现即停（观察器已覆盖其子树）。
  const stopPolling = controller.interval(() => {
    if (document.querySelector(SIDEBAR_SELECTOR))
      stopPolling()
  }, 400)
})
