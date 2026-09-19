/**
 * client/register/turn-tail.ts — 把变更卡片注册进 `conversation.chat.turnTail`。
 *
 * 这个槽位在两代内核里是两种型别，同一份注册对象要同时满足两边：
 * - ≤ 0.1.6-alpha.1 为 **chain**：按 priority 升序征询 select，首个返回非 null 的条目当选，
 *   同一轮只渲染一个条目。
 * - ≥ 0.1.6-alpha.2 为 **list**：必须带 id；同名 id 只保留 priority 最低的那一条（最低者渲染）。
 *
 * 因此注册对象带齐 select + id + 更低的 priority：官方 `ui-deliverables` 以默认 priority 0 占用该槽，
 * 这里以 -1 抢先——chain 型靠选举胜出，list 型靠复用官方 id 占住同一格，把它的 “Files changed” 行
 * 换成带撤销能力的卡片。select 在 list 型下不会被调用，id 在 chain 型下不会被读取，并存互不影响。
 *
 * select 必须是**纯函数**（只读 owner props）：因此「本轮有没有记录」不能在那里判断，只能先
 * 无脑当选，再由组件按 store 状态决定渲染内容。list 型不派发 matched，组件只能读 owner props 本身。
 * 能力探测放在 inject 工厂里（渲染那一刻），该服务由另一个客户端插件发布，apply 顺序不保证它已经就位。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { TurnChangesCard } from '../components/turn-changes-card'
import { PLUGIN_ID } from '../constants'
import { readCapabilities } from '../service/capabilities'

/** 完成一轮对话的尾部槽位名（chain / list 双型别，见文件头）。 */
const TURN_TAIL_SLOT = 'conversation.chat.turnTail'

/** 官方 `ui-deliverables` 在该槽登记的 id；list 型内核里复用它是顶掉官方那一行的唯一办法。 */
const TURN_TAIL_ID = '@deepseek-ai/dsh-client-ui-deliverables'

/** 低于官方默认 0：chain 型＝选举优先级，list 型＝同格抢占优先级。 */
const TURN_TAIL_PRIORITY = -1

/** chain 征询用的 owner props 视图（框架派发 turnTail 的 owner 份额）。 */
interface TurnTailOwnerLike {
  turn?: { turn?: number } | undefined
}

export const turnTailFeature = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(ctx.slots.inject(
    TURN_TAIL_SLOT as never,
    () =>
      ctx.slots.register(
        {
          name: TURN_TAIL_SLOT,
          id: TURN_TAIL_ID,
          registrant: PLUGIN_ID,
          priority: TURN_TAIL_PRIORITY,
          select: (owner: TurnTailOwnerLike) => ({ turn: owner?.turn?.turn ?? 0 }),
          inject: (sessionId?: string) => ({ sessionId, capabilities: readCapabilities(ctx) }),
        } as never,
        TurnChangesCard as never,
      ),
  ))
})
