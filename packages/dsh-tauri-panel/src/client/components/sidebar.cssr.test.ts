import { describe, expect, it, vi } from 'vitest'

import sidebarStyle from './sidebar.cssr'

// dsh-tauri-ui/client 的 dist bundle 以 `window.__ModuleLoader__.load(...)` 包裹，
// 脱离宿主加载器后无法在 node 环境求值；把该导入 mock 到同一 cssr 实例的源文件
// （cssr.ts），使本包的样式树能在测试里直接 render() 核对选择器形态。
// （vitest 会提升 vi.mock，声明位置在 import 之后也无碍。）
vi.mock('dsh-tauri-ui/client', async () => {
  const mod = await import('../../../../dsh-tauri-ui/src/client/utils/cssr.ts')
  return { cssr: mod.cssr }
})

describe('sidebar.cssr new-session（回归：白底 + 圆角的官方按钮形态）', () => {
  const sidebarCss = sidebarStyle.render()

  it('基态自给自足：镜像官方 ui-sidebar New Session 按钮（elevated-fill 白底、12px 圆角、38px、500 字重、.5px l3 描边）', () => {
    const base = /\.dshp-panel \.dshp-panel__new-session\s*\{[^}]*\}/
    const baseBody = sidebarCss.match(base)?.[0] ?? ''
    expect(baseBody).toContain('background: var(--dsw-alias-button-elevated-fill)')
    expect(baseBody).toContain('border-radius: 12px')
    expect(baseBody).toContain('height: 38px')
    expect(baseBody).toContain('font-weight: 500')
    expect(baseBody).toContain('border: .5px solid var(--dsw-alias-border-l3)')
  })

  it('不依赖 .dshp-panel__menu-item 提供按钮基座：display:flex 等交互基座自含，折叠态规则仍生效', () => {
    const base = /\.dshp-panel \.dshp-panel__new-session\s*\{[^}]*\}/
    const baseBody = sidebarCss.match(base)?.[0] ?? ''
    expect(baseBody).toContain('display: flex')
    expect(baseBody).toContain('cursor: pointer')
    expect(sidebarCss).toMatch(/\.dshp-panel\.dshp-panel--collapsed \.dshp-panel__new-session\s*\{[^}]*width: 36px[^}]*\}/)
  })
})

describe('sidebar.cssr panel-list（官方全局面板清单容器）', () => {
  const sidebarCss = sidebarStyle.render()

  it('清单自身排成与 panel-area 同节奏的列，行样式交给 .dshp-panel__menu-item', () => {
    const rule = /\.dshp-panel \.dshp-panel__panel-list\s*\{[^}]*\}/
    const body = sidebarCss.match(rule)?.[0] ?? ''
    expect(body).toContain('display: flex')
    expect(body).toContain('flex-direction: column')
    expect(body).toContain('gap: 2px')
  })

  it('折叠态经后代选择器覆盖清单内的行（与私有协议条目同一份样式）', () => {
    expect(sidebarCss).toMatch(
      /\.dshp-panel\.dshp-panel--collapsed \.dshp-panel__menu-item\s*\{[^}]*width: 36px[^}]*\}/,
    )
  })
})

describe('sidebar.cssr footer-actions（回归：footer.action 槽多条目堆叠为列，issue #533）', () => {
  const sidebarCss = sidebarStyle.render()

  it('基态排成列：sidebar.footer.action（kind:list）的多个条目各占一行，不再并排挤压', () => {
    const rule = /\.dshp-panel \.dshp-panel__footer-actions\s*\{[^}]*\}/
    const body = sidebarCss.match(rule)?.[0] ?? ''
    // 缺 flex-direction 时 flex 容器默认 row —— 正是 #533 的根因。
    expect(body).toContain('flex-direction: column')
    expect(body).toContain('display: flex')
    // stretch 令条目撑满行宽，等价于下方 settings-area 里块级子元素的默认行为
    // （整行 badge 的 width:100% 不再被同排条目压扁）。
    expect(body).toContain('align-items: stretch')
    expect(body).toContain('width: 100%')
  })

  it('折叠 rail 态把横向居中换到 cross 轴：收缩为内容宽 + alignItems 居中，纵向语义的 justifyContent 不再残留', () => {
    const rule = /\.dshp-panel\.dshp-panel--collapsed \.dshp-panel__footer-actions\s*\{[^}]*\}/
    const body = sidebarCss.match(rule)?.[0] ?? ''
    expect(body).toContain('width: auto')
    expect(body).toContain('align-items: center')
    expect(body).not.toContain('justify-content: center')
  })

  it('折叠态的 settings-area 居中语义保持原样（仍是 row + justifyContent，未被 #533 改动波及）', () => {
    const rule = /\.dshp-panel\.dshp-panel--collapsed \.dshp-panel__settings-area\s*\{[^}]*\}/
    const body = sidebarCss.match(rule)?.[0] ?? ''
    expect(body).toContain('justify-content: center')
    expect(body).toContain('width: auto')
    expect(body).not.toContain('align-items')
  })
})
