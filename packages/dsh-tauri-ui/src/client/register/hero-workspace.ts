import type { AdapterWorkspaces, ClientAdapter, ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../../shared/constants'
import { HeroWorkspace } from '../components/hero-workspace'
import {
  HERO_WORKSPACE_FLOW_SLOT,
  HERO_WORKSPACE_PRIORITY,
  HERO_WORKSPACE_SLOT,
} from '../constants'
import { startUngroupedSession } from '../service/ungrouped-session'

/**
 * 接管官方 `conversation.hero.workspace`（single/root）：按更低 priority 顶掉官方 `WorkspacePicker`，
 * 官方注册仍在场（其子槽 `…directoryFlow` 继续有效，本条目退位时官方选择器原样回来）。
 */
export const heroWorkspaceFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  const directoryFlow = {
    getSnapshot: () => ctx.slots.entries(HERO_WORKSPACE_FLOW_SLOT as never).length > 0,
    subscribe: (listener: () => void) => ctx.slots.subscribe(HERO_WORKSPACE_FLOW_SLOT as never, listener),
  }

  controller.add(ctx.slots.inject(HERO_WORKSPACE_SLOT as never, () =>
    ctx.slots.register(
      {
        name: HERO_WORKSPACE_SLOT,
        registrant: PLUGIN_ID,
        priority: HERO_WORKSPACE_PRIORITY,
        inject: () => ({
          createWorkspace: readCreateWorkspace(adapter),
          startUngrouped: () => startUngroupedSession(ctx),
          hooks: { directoryFlow },
        }),
      } as never,
      HeroWorkspace as never,
    )))
})

/** 调用期解析：适配层创建期的 `adapter.workspaces` 快照可能因服务晚到而永久缺席。 */
function readCreateWorkspace(adapter: ClientAdapter): AdapterWorkspaces['create'] {
  return adapter.service<AdapterWorkspaces>('workspaces')?.create
}
