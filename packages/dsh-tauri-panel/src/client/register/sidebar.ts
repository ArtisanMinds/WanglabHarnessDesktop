import type { ClientContext, WorkspaceId } from 'dsh-tauri/client'
import type { PanelListService } from '../service/panel-list'
import { defineRegister } from 'dsh-tauri/client'
import { SidebarRootClone } from '../components/sidebar'
import { PANEL_ACTION_SLOT } from '../constants'
import { NS } from '../locales'

/**
 * register/sidebar.ts — sidebar 槽整槽替换的安装器（priority -1 shadow 官方
 * ui-sidebar）；克隆组件见 components/sidebar.tsx。
 *
 * 等待 sidebar 槽声明（layout 的 AppFrame renderSlot("sidebar")）后，以
 * priority -1 shadow 官方 ui-sidebar 条目；children 仅声明新增的
 * sidebar.panel.action 协议槽（官方子槽由被 shadow 的官方条目声明，克隆经
 * <SlotOutlet> 渲染）。
 *
 * inject 向克隆注入：
 *   - `startSession`：新会话。跨核心版本的官方导航入口漂移（Alpha 在 uiWorkspace、
 *     rc.2 在 workspaces）全部由适配层承担：`adapter.startSession()` 走
 *     「官方服务 → 点官方按钮 → 明确回报不可用」的退级阶梯，消费方不猜版本号；
 *   - `toggleSidebar`：折叠开关（ctx.layout）；
 *   - `selectPanel`：官方全局面板选中（ctx.layout.selectPanel，≥0.1.5-rc.1；
 *     旧核心缺席时降级为 no-op——该核心也没有 panellist 槽，行不会渲染）；
 *   - `panels`：官方 `sidebar.panellist` 的行投影 store（见 service/panel-list.ts）。
 *
 * 框架标准 prop `usePanelInfo`（选中态）由 root hook 自动合成，无需 inject。
 * 槽位注册走 `defineRegister`：inject 句柄由控制器统一 dispose。
 * @param ctx - 客户端根上下文。
 * @param panelList - 官方全局面板行投影服务。
 */
export function registerSidebarRoot(ctx: ClientContext, panelList: PanelListService): void {
  ctx.effect(
    defineRegister<ClientContext>(ctx, (controller, clientCtx, adapter) => {
      controller.add(clientCtx.slots.inject('sidebar' as never, () =>
        clientCtx.slots.register(
          {
            name: 'sidebar',
            id: 'dsh-tauri-panel',
            priority: -1,
            locale: NS,
            children: {
              [PANEL_ACTION_SLOT]: { kind: 'list', scope: 'root' },
            },
            inject: () => ({
              startSession: (workspaceId?: WorkspaceId) => {
                // 退级阶梯在适配层内：官方导航服务 → 官方「新建会话」按钮 → 不可用。
                void adapter.startSession(workspaceId).then((outcome) => {
                  if (outcome.status === 'unavailable')
                    console.error(`[dsh-tauri-panel] new session unavailable: ${outcome.reason}`)
                })
              },
              toggleSidebar: () => clientCtx.layout.toggleSidebar(),
              selectPanel: (panelId: string | null) => {
                // 旧核心没有全局面板：静默忽略，绝不向 ctx.layout 断言方法存在。
                clientCtx.layout.selectPanel?.(panelId)
              },
              panels: panelList.store,
            }),
          } as never,
          SidebarRootClone,
        )))
    }),
    'dsh-tauri-panel: sidebar root',
  )
}
