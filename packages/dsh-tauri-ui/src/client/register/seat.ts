import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { TauriUiSeat } from '../components/seat'
import {
  SETTINGS_REGISTRANT,
  SETTINGS_SHELL_OVERLAY_SLOT,
  SETTINGS_SHELL_SEAT_ID,
} from '../constants'

/**
 * register/seat.ts — shell.overlay 落点座位注册（骨架占位，defineRegister）。
 *
 * 骨架期落点：未来桌面 chrome（顶部导航/窗口控件等）在此渲染。shell.overlay
 * 由 ui-layout 的 AppFrame 声明，故通过 inject 等其声明（live）后再注册；
 * 注册句柄交给 controller，插件卸载时随 effect 一并撤销。
 */
export const registerShellSeat = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(
    ctx.slots.inject(SETTINGS_SHELL_OVERLAY_SLOT, () =>
      ctx.slots.register(
        {
          name: SETTINGS_SHELL_OVERLAY_SLOT,
          id: SETTINGS_SHELL_SEAT_ID,
          registrant: SETTINGS_REGISTRANT,
        },
        TauriUiSeat,
      )),
  )
})
