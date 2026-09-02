/**
 * register/control.ts — 桌宠浮控件注册：装入 layout 声明的 `shell.overlay` 槽。
 *
 * shell.overlay 是 list/root 槽（通用浮层，点击穿透——条目自行 opt-in 事件），
 * 以独立 id 并排在框架官方条目旁，不替换任何槽。等待槽声明后注册，
 * 卸载时随插件停用整体释放。
 */
import type { Context } from '@deepseek-ai/cordis'
// 拉入 dsh-client-ui-renderer 的 `declare module '@deepseek-ai/cordis'` 增广，
// 让 `ctx.slots`（SlotRegistry）获得类型（运行时由 UI renderer 提供）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer'
import { PetControl } from '../components/pet-control'
import { PET_CONTROL_SLOT_ID } from '../constants'

export function installPetControl(ctx: Context): void {
  ctx.slots.inject('shell.overlay' as never, () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: PET_CONTROL_SLOT_ID,
        order: 100,
        registrant: 'dsh-tauri-pet',
      } as never,
      PetControl as never,
    ))
}