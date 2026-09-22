import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'
import { startUngroupedSession } from '../service/ungrouped-session'
import { newSessionButtonFrom } from './new-session.utils'

/**
 * 官方侧边栏「新建会话」默认落到未分组：官方 onClick 挂在 React 根容器上，document 捕获阶段的
 * 监听先于它执行，`stopImmediatePropagation()` 即可让官方的 `startSession()` 分支整条不跑。
 *
 * 能力探测在**点击时**做（不是装配时）：composer 补丁的能力标记由官方 conversation 产物在
 * 求值时写下，装配顺序不保证它已经到位。缺补丁时放行官方分支（退级第 4 级），只告警一次。
 */
export const sidebarNewSessionFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  if (typeof document === 'undefined')
    return

  let warned = false

  controller.listen('click', (event) => {
    if (newSessionButtonFrom(event.target) === null)
      return
    if (!adapter.has('composer.workspace-less')) {
      if (!warned) {
        warned = true
        console.warn(
          `[${PLUGIN_ID}] 「未分组」新建会话不可用：缺少桌面壳 composer 补丁（composer.workspace-less），沿用官方工作区选择。`,
        )
      }
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    startUngroupedSession(ctx, adapter)
  }, { capture: true })
})
