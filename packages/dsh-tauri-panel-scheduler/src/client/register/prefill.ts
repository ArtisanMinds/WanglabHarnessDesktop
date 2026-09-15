/**
 * register/prefill.ts — 「通过 Chat 创建」草稿预填桥的 slot 注册（defineRegister feature）。
 *
 * 注册进 conversation.input.left 槽（照搬 dsh-automation index.ts 的
 * PrefillBridge 注册）；inject 句柄由 controller 托管，插件卸载时统一撤销。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PrefillBridge } from '../components/prefill-bridge'
import {
  CONVERSATION_INPUT_LEFT_SLOT,
  INPUT_PREFILL_ID,
  INPUT_PREFILL_ORDER,
  INPUT_PREFILL_PRIORITY,
  PLUGIN_ID,
} from '../constants'

/**
 * 预填桥 feature：把草稿输入框挂到会话输入区左侧槽。
 * 运行期：`ctx.effect(prefillFeature, PREFILL_EFFECT)`。
 */
export const prefillFeature = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(ctx.slots.inject(CONVERSATION_INPUT_LEFT_SLOT as never, () => ctx.slots.register({
    name: CONVERSATION_INPUT_LEFT_SLOT,
    id: INPUT_PREFILL_ID,
    registrant: PLUGIN_ID,
    order: INPUT_PREFILL_ORDER,
    priority: INPUT_PREFILL_PRIORITY,
    inject: (sessionId: string) => ({ sessionId }),
  } as never, PrefillBridge)))
})
