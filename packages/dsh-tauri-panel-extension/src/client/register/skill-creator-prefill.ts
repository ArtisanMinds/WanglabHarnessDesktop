/**
 * register/skill-creator-prefill.ts — 技能创建器草稿预填的 slot 注册 feature。
 *
 * 注册进 conversation.input.left 槽；`defineRegister` 的 controller 统一释放 inject
 * 句柄，并在装配与卸载时清理待预填登记集合。
 */

import type { ExtensionClientContext } from '../types'
import { defineRegister } from 'dsh-tauri/client'
import { SkillCreatorPrefill } from '../components/skill-creator-prefill'
import {
  CONVERSATION_INPUT_LEFT_SLOT,
  INPUT_PREFILL_ID,
  INPUT_PREFILL_ORDER,
  INPUT_PREFILL_PRIORITY,
  PLUGIN_ID,
} from '../constants'
import { store } from '../store'

export const skillCreatorPrefillFeature = defineRegister<ExtensionClientContext>((controller, ctx) => {
  store.prefill.clear()
  controller.add(ctx.slots.inject(CONVERSATION_INPUT_LEFT_SLOT as never, () => ctx.slots.register({
    name: CONVERSATION_INPUT_LEFT_SLOT,
    id: INPUT_PREFILL_ID,
    registrant: PLUGIN_ID,
    order: INPUT_PREFILL_ORDER,
    priority: INPUT_PREFILL_PRIORITY,
    inject: (sessionId: string) => ({ sessionId }),
  } as never, SkillCreatorPrefill)))
  controller.add(() => store.prefill.clear())
})
