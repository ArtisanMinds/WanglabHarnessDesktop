import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { startUngroupedSession } from '../service/ungrouped-session'
import { newSessionButtonFrom } from './new-session.utils'

/**
 * 官方侧边栏「新建会话」默认落到未分组：官方 onClick 挂在 React 根容器上，document 捕获阶段的
 * 监听先于它执行，`stopImmediatePropagation()` 即可让官方的 `startSession()` 分支整条不跑。
 */
export const sidebarNewSessionFeature = defineRegister<ClientContext>((controller, ctx) => {
  if (typeof document === 'undefined')
    return

  controller.listen('click', (event) => {
    if (newSessionButtonFrom(event.target) === null)
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    startUngroupedSession(ctx)
  }, { capture: true })
})
