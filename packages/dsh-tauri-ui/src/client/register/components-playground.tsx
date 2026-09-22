import type { ClientContext } from 'dsh-tauri/client'
import { definePanel, defineRegister, invoke } from 'dsh-tauri/client'
import { Icon } from '../components/icon'
import { Puzzle } from '../components/icons'
import { PanelPage } from '../components/panel-page'
import { UI_COMPONENTS_PANEL_ID, UI_COMPONENTS_PANEL_ORDER } from '../constants'
import { locale } from '../locales'
import { UiComponentsPanel } from '../ui/components-playground/ui-components'

/**
 * 仅 dev 构建挂载的「UI 组件」面板。
 *
 * 插件侧没有可用的构建期开关（`dsh-tauri-tsdown` 无条件把 `process.env.NODE_ENV`
 * 定成 `'production'`，也不替换 `import.meta.env`），因此向宿主问 `is_dev_build`；
 * 命令不可用（旧宿主或非桌面宿主）时按 release 处理，宁可不显示也不误发调试入口。
 */
export const registerUiComponentsPanel = defineRegister<ClientContext>((controller, ctx) => {
  // 同一 profile 也服务普通浏览器标签：只有桌面 iframe 有宿主命令可问。
  if (typeof window === 'undefined' || window.parent === window)
    return

  invoke<boolean>('is_dev_build')
    .then((dev) => {
      if (!dev)
        return
      const panel = definePanel(ctx, {
        id: UI_COMPONENTS_PANEL_ID,
        order: UI_COMPONENTS_PANEL_ORDER,
        label: () => locale.text('uiComponents'),
        icon: props => <Icon as={Puzzle} size={props.size} />,
        render: () => <PanelPage><UiComponentsPanel /></PanelPage>,
      })
      controller.add(panel.dispose)
    })
    .catch((error: unknown) => {
      console.warn('[dsh-tauri-ui] is_dev_build unavailable; UI components panel stays hidden', error)
    })
})
