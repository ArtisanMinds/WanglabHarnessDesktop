import type { ClientAdapter, ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PetSettings } from '../components/pet-settings'
import { PetPrefill } from '../components/prefill'
import { pendingPrefills } from '../config'
import {
  CONVERSATION_INPUT_LEFT_SLOT,
  PET_CLIENT_PLUGIN,
  PET_HATCH_PROMPT,
  PET_PREFILL_ID,
  PET_PREFILL_ORDER,
  PET_PREFILL_PRIORITY,
  PET_SECTION_ID,
  PET_SECTION_ORDER,
} from '../constants'
import { registerSidebarPetIcon } from '../dom/sidebar-icon'
import { text } from '../locales'
import { chooseWorkspace } from '../utils/workspace'

/**
 * register/pet.ts — 桌宠的三处客户端注册（settings.section 分区、侧栏入口补丁、
 * conversation.input.left 草稿注入）。
 *
 * 每个注册一个 `defineRegister` effect：槽位 inject 句柄、观察器、定时器与订阅
 * 全部由控制器统一 dispose；apply 里逐个 `ctx.effect(feature, '<plugin>: <feature>')`。
 * 跨核心版本的官方导航入口漂移由适配层（第三个参数 `adapter`）承担，这里不猜版本号。
 */

/** settings.section 里的桌宠设置分区（与归档分区同点位）。 */
export const petSectionFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  controller.add(ctx.slots.inject('settings.section' as never, () => ctx.slots.register({
    name: 'settings.section',
    id: PET_SECTION_ID,
    order: PET_SECTION_ORDER,
    registrant: PET_CLIENT_PLUGIN,
    label: () => text('name'),
    inject: () => ({ onCreate: (close?: () => void) => createPetSession(adapter, close) }),
  } as never, PetSettings as never)))
})

/** 侧栏桌宠入口（DOM 补丁按钮，见 dom/sidebar-icon.ts）。 */
export const petIconPatchFeature = defineRegister<ClientContext>((controller) => {
  registerSidebarPetIcon(controller)
})

/** conversation.input.left 的一次性草稿注入（新建桌宠会话后把 /hatch 提示词填进输入框）。 */
export const petPrefillFeature = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(ctx.slots.inject(CONVERSATION_INPUT_LEFT_SLOT as never, () => ctx.slots.register({
    name: CONVERSATION_INPUT_LEFT_SLOT,
    id: PET_PREFILL_ID,
    order: PET_PREFILL_ORDER,
    priority: PET_PREFILL_PRIORITY,
    registrant: PET_CLIENT_PLUGIN,
    inject: (sessionId: string) => ({ sessionId }),
  } as never, PetPrefill)))
  controller.add(() => pendingPrefills.clear())
})

/** 新建桌宠会话需要的官方导航能力（工作区从列表投影里挑）。 */
function resolvePetWorkspace(adapter: ClientAdapter): {
  connectWorkspace: (id: string) => unknown
  workspaceId: string
} {
  const workspaceId = chooseWorkspace(adapter)
  const connectWorkspace = adapter.workspaces.connectWorkspace
  if (workspaceId === undefined || connectWorkspace === undefined)
    throw new Error('PET_WORKSPACE_UNAVAILABLE: no workspace can create a pet session')
  return { connectWorkspace, workspaceId }
}

/**
 * 跟随官方新建会话的目标顺序（当前 → 最近 → 第一个工作区），并在目标会话上装好
 * 一次性草稿：连接工作区拿到会话 id，写入 `/hatch` 提示词后打开该会话。
 */
async function createPetSession(adapter: ClientAdapter, close?: () => void): Promise<void> {
  const start = resolvePetWorkspace(adapter)
  const open = adapter.sessions.open
  if (open === undefined)
    throw new Error('PET_SESSION_UNAVAILABLE: session opener is unavailable')

  const sessionId = await start.connectWorkspace(start.workspaceId)
  if (typeof sessionId !== 'string' || sessionId.length === 0)
    throw new Error('PET_SESSION_UNAVAILABLE: workspace did not return a session id')

  pendingPrefills.set(sessionId, PET_HATCH_PROMPT)
  close?.()
  open(sessionId)
}
