/**
 * register/archive-section.ts — 设置页「归档」分区的 slot 注册 feature。
 *
 * 注册进 settings.section（导航行/内容由官方设置侧边栏投影）；`inject` 返回的
 * 会话/工作区运行时面取自 `adapter.sessions` / `adapter.workspaces`（跨核心版本的
 * 服务布局差异由适配层收敛，见 dsh-tauri/client 的 register/index.adapter）。
 * 卸载由 `defineRegister` 的 controller 统一释放 inject / register 句柄。
 */

import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { ArchivePanel } from '../components/archive-panel'
import {
  SESSION_REGISTRANT,
  SESSION_SECTION_ID,
  SESSION_SECTION_ORDER,
  SETTINGS_SECTION_SLOT,
} from '../constants'
import { text } from '../locales'

export const archiveSectionFeature = defineRegister<ClientContext>((controller, ctx, adapter) => {
  controller.add(
    ctx.slots.inject(SETTINGS_SECTION_SLOT as never, () =>
      ctx.slots.register(
        {
          name: SETTINGS_SECTION_SLOT,
          id: SESSION_SECTION_ID,
          order: SESSION_SECTION_ORDER,
          registrant: SESSION_REGISTRANT,
          label: () => text('section'),
          inject: () => ({
            sessionsRuntime: adapter.sessions,
            workspacesRuntime: adapter.workspaces,
          }),
        } as never,
        ArchivePanel,
      )),
  )
})
