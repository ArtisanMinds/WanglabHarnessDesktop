/**
 * 批次 06 · `dsh-tauri-ui` 宿主路由与设置侧栏（契约见 `docs/specs/plugin.test.md`）。
 *
 * 宿主侧只覆盖续跑路由的两条拒绝分支：缺参（400）与会话不存在（404）。断言对象是外部
 * 世界（HTTP 状态码与响应字节），不采信插件自报；`error` 文案必须逐字相等，否则
 * 「路由在跑」与「路由换了实现」在测试里不可区分。
 *
 * 复用 globalSetup 的共享宿主（`also` 默认已挂载本插件），不另起进程。
 * 运行中 / 已正常结束（409）与两条注入失败（500：loader 缺失 / `dsh-llm` 导出缺失）都需要
 * 真实会话，scratch 宿主无造会话手段，保持待补。
 */

import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import {
  COMPOSER_CARD,
  expectNoSyntheticFallbacks,
  launchDshBrowser,
  newDshPage,
  openSettings,
  PET_ICON,
  SETTINGS_SIDEBAR,
  SETTINGS_TRIGGER,
} from '../support/browser'

/** 与 `packages/dsh-tauri-ui/src/host/routes/index.ts:5` 的唯一路由对齐。 */
const RESUME_PATH = '/api/desktop/dsh-tauri-ui/session/resume'

/** `/api/**` 要求浏览器会话；Cookie 由编排在根路径用一次性 token 换得。 */
function headers(): Record<string, string> {
  return { 'cookie': inject('dshCookie'), 'content-type': 'application/json' }
}

/** 插件接管后的英雄区工作区 chip（`components/hero-workspace.tsx` 渲染）。 */
const HERO_WORKSPACE_CHIP = '.dshp-hero-workspace'

/**
 * 官方英雄区工作区 chip：与插件 chip 共用 aria-label（官方 conversation 词典 `hero.chooseWorkspace`），
 * 用 `:not(.dshp-hero-workspace)` 把两者分开。官方行类名取自官方 ConversationRoot 模块。
 */
const OFFICIAL_HERO_WORKSPACE_CHIP = '[class$="heroWorkspaceRow"] button[aria-label="选择工作区"]:not(.dshp-hero-workspace)'

/**
 * 官方侧边栏「新建会话」按钮（官方 sidebar 词典 `session.new.label`）。
 *
 * 品牌按钮与工具栏按钮共用这条文案，品牌按钮被 `dsh-tauri-ui` 的全局样式隐藏，故按可见性取工具栏那枚。
 */
const SIDEBAR_NEW_SESSION = 'button[aria-label="新建会话"]:visible'

function url(): string {
  return `${inject('dshBaseUrl')}${RESUME_PATH}`
}

interface ResumeBody {
  error?: string
  ok?: boolean
}

describe('L2 宿主路由', () => {
  it('[反向] 验证续跑缺 sessionId 返回 400', async () => {
    const response = await fetch(url(), { method: 'POST', headers: headers(), body: '{}' })

    expect(response.status, '缺参必须在读体后立刻以 400 结束').toBe(400)

    const body = await response.json() as ResumeBody
    expect(body.error, '缺参文案必须逐字相等，才能与其它 400 区分').toBe('缺少 sessionId')
    expect(JSON.stringify(body), '缺参不得走到注入成功分支').not.toContain('"ok":true')
  })

  it('[反向] 验证未知会话返回 404', async () => {
    const response = await fetch(url(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sessionId: 'does-not-exist' }),
    })

    expect(response.status, '会话不存在必须是 404，而不是 500（服务内部抛错）').toBe(404)

    const body = await response.json() as ResumeBody
    expect(body.error, '会话不存在文案必须逐字相等').toBe('会话不存在或尚未运行')
    expect(JSON.stringify(body), '未知会话不得走到注入成功分支').not.toContain('"ok":true')
  })
})

describe('L2 客户端', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await launchDshBrowser()
  })

  afterAll(async () => {
    await browser.close()
  })

  it('验证设置侧栏与触发器被注入 dsh 界面', async () => {
    const app = await newDshPage(browser, { ready: PET_ICON })
    try {
      const triggerHost = await app.frame.evaluate(() => {
        const trigger = document.querySelector('.dshp-settings-trigger')
        const sidebar = document.querySelector('[data-slot="sidebar"]')
        return {
          triggerInsideSidebar: Boolean(trigger && sidebar?.contains(trigger)),
          triggerTag: trigger?.tagName,
        }
      })
      expect(triggerHost.triggerInsideSidebar, '设置触发器必须是侧栏内的原生按钮').toBe(true)
      expect(triggerHost.triggerTag, '触发器必须是 button').toBe('BUTTON')

      await openSettings(app.page, app.frame, app.syntheticFallbacks)

      const state = await app.frame.evaluate(() => {
        const root = document.querySelector('[data-slot-sidebar="dsh-tauri-ui"]')
        const nav = root?.querySelector('nav')
        return {
          rootCount: document.querySelectorAll('[data-slot-sidebar="dsh-tauri-ui"]').length,
          hasSearch: root?.querySelector('input') !== null,
          navLabels: Array.from(nav?.querySelectorAll('button') ?? []).map(button => button.textContent?.trim()),
          railWidth: root === null ? null : Math.round((root.firstElementChild as HTMLElement).getBoundingClientRect().width),
        }
      })

      expect(state.rootCount, '设置侧栏标记必须唯一').toBe(1)
      expect(state.hasSearch, '设置侧栏必须带搜索框').toBe(true)
      expect(state.navLabels.length, '设置侧栏必须至少渲染一个导航项').toBeGreaterThan(0)
      expect(state.navLabels, '插件分区与核心分区必须同时出现在同一侧栏').toContain('宠物')
      expect(state.navLabels, '本插件提供的设置分区必须在同一侧栏').toContain('插件')
      expect(state.railWidth, '侧栏宽度必须落在插件声明的 264–420px 夹紧区间内（插件不覆写宿主宽度）')
        .toBeGreaterThanOrEqual(264)
      expect(state.railWidth!).toBeLessThanOrEqual(420)
      expectNoSyntheticFallbacks(app)
      expect(app.errors, '侧栏注入不得抛出应用级错误').toEqual([])
    }
    finally {
      await app.close()
    }
  })

  it('验证触发器 aria-expanded 随设置侧栏开合变化', async () => {
    const app = await newDshPage(browser, { ready: SETTINGS_TRIGGER })
    try {
      const trigger = app.frame.locator(SETTINGS_TRIGGER).first()
      expect(await trigger.getAttribute('aria-expanded'), '初始必须为 false').toBe('false')
      expect(await app.frame.locator(SETTINGS_SIDEBAR).count(), '初始不得渲染设置侧栏').toBe(0)

      await openSettings(app.page, app.frame, app.syntheticFallbacks)
      expect(await trigger.getAttribute('aria-expanded'), '首次点击后必须为 true').toBe('true')
      await expect.poll(
        async () => await app.frame.locator(SETTINGS_SIDEBAR).first().isVisible(),
        { timeout: 10_000, message: '展开后设置侧栏必须可见' },
      ).toBe(true)

      // 展开态下设置触发器被设置侧栏整体盖住（`trigger.boundingBox()` 为 null），
      // 收起只能走侧栏自身的 Escape 通道（`sidebar.tsx` 的 keydown 监听）。
      await app.page.keyboard.press('Escape')
      await expect.poll(
        async () => await trigger.getAttribute('aria-expanded'),
        { timeout: 10_000, message: 'Escape 后必须回到 false' },
      ).toBe('false')
      expect(await app.frame.locator(SETTINGS_SIDEBAR).count(), '收起后设置侧栏必须卸载').toBe(0)
      expectNoSyntheticFallbacks(app)
      expect(app.errors, '开合不得抛出应用级错误').toEqual([])
    }
    finally {
      await app.close()
    }
  })

  it('[反向] 验证无可续跑轮次时主按钮不被改写为「继续任务」', async () => {
    const app = await newDshPage(browser, { ready: COMPOSER_CARD })
    try {
      const state = await app.frame.evaluate(() => {
        const card = document.querySelector('[data-composer-card]')
        const buttons = Array.from(card?.querySelectorAll('button') ?? [])
        const primary = buttons[buttons.length - 1]
        return {
          cardExists: card !== null,
          placeholderVisible: card?.querySelector('[data-composer-placeholder]') !== null,
          label: primary?.getAttribute('aria-label') ?? null,
          svgWidth: primary?.querySelector('svg')?.style.width ?? null,
        }
      })

      expect(state.cardExists, 'composer 卡片必须存在（否则这条断言没有目标）').toBe(true)
      expect(state.placeholderVisible, 'scratch 宿主无活动会话，草稿必然为空').toBe(true)
      expect(state.label, '没有可续跑轮次时不得把主按钮改写成「继续任务」').not.toBe('继续任务')
      expect(state.svgWidth, '未被补丁改写时不得带补丁的 14px 内联宽度').not.toBe('14px')
      expect(app.errors, '补丁在无匹配轮次时必须静默').toEqual([])
    }
    finally {
      await app.close()
    }
  })

  it('验证空草稿下并发保护不启用发送按钮', async () => {
    const app = await newDshPage(browser, { ready: COMPOSER_CARD })
    try {
      const state = await app.frame.evaluate(() => {
        const card = document.querySelector('[data-composer-card]')
        const buttons = Array.from(card?.querySelectorAll('button') ?? [])
        const primary = buttons[buttons.length - 1] as HTMLButtonElement | undefined
        const placeholder = card?.querySelector('[data-composer-placeholder]')
        return {
          empty: placeholder !== null,
          disabled: primary?.disabled ?? null,
          label: primary?.getAttribute('aria-label') ?? null,
        }
      })

      expect(state.empty, '夹具前置：草稿必须为空').toBe(true)
      expect(state.disabled, '空草稿的主按钮必须保持不可点击').toBe(true)
      expect(state.label, '空草稿的按钮文案必须是官方文案').not.toBe('继续任务')
      expect(app.errors, '空草稿不得触发补丁异常').toEqual([])
    }
    finally {
      await app.close()
    }
  })

  it('验证英雄区工作区选择被插件接管，官方 chip 让位且菜单首位是「未分组」', async () => {
    const app = await newDshPage(browser, { ready: HERO_WORKSPACE_CHIP })
    try {
      // 官方 chip 与插件 chip 共用 aria-label（官方 conversation 词典 `hero.chooseWorkspace`），
      // 用类名把两者分开：官方那枚必须仍在 DOM 里（接管失败时可原样回来）但被样式隐藏。
      const chips = await app.frame.evaluate((officialSelector) => {
        const row = document.querySelector('[class$="heroWorkspaceRow"]')
        const official = row?.querySelector(officialSelector) ?? null
        return {
          rowExists: row !== null,
          officialInRow: official !== null,
          officialDisplay: official === null ? null : getComputedStyle(official).display,
          oursInRow: row?.querySelector('.dshp-hero-workspace') !== null,
          oursCount: document.querySelectorAll('.dshp-hero-workspace').length,
        }
      }, OFFICIAL_HERO_WORKSPACE_CHIP)

      expect(chips.rowExists, '英雄区工作区行必须存在（否则这条断言没有目标）').toBe(true)
      expect(chips.officialInRow, '官方 chip 必须仍在 DOM 中：接管条目退位时要能原样回来').toBe(true)
      expect(chips.officialDisplay, '官方 chip 必须被隐藏，否则会出现两枚选择控件').toBe('none')
      expect(chips.oursInRow, '接管后的 chip 必须渲染在官方同一行内').toBe(true)
      expect(chips.oursCount, '接管后的 chip 必须唯一').toBe(1)

      await app.frame.locator(HERO_WORKSPACE_CHIP).click()

      const menu = await app.frame.evaluate(() => {
        const chip = document.querySelector('.dshp-hero-workspace')
        const items = Array.from(document.querySelectorAll('button[role="menuitem"]')) as HTMLButtonElement[]
        return {
          expanded: chip?.getAttribute('aria-expanded') ?? null,
          count: items.length,
          labels: items.map(item => item.textContent?.trim() ?? ''),
          firstDisabled: items[0]?.disabled ?? null,
        }
      })

      expect(menu.expanded, '菜单打开时 chip 必须回报 aria-expanded').toBe('true')
      expect(menu.count, '打开后必须渲染菜单条目').toBeGreaterThan(0)
      expect(menu.labels[0], '「未分组」必须是第一个选项').toBe('未分组')
      expect(menu.labels.filter(label => label === '未分组'), '「未分组」只能出现一次').toHaveLength(1)
      expect(menu.firstDisabled, '目录流程空闲时「未分组」必须可选').toBe(false)
      expectNoSyntheticFallbacks(app)
      expect(app.errors, '接管英雄区选择控件不得抛出应用级错误').toEqual([])
    }
    finally {
      await app.close()
    }
  })

  it('验证侧边栏「新建会话」默认落到未分组，不再强制先选工作区', async () => {
    const app = await newDshPage(browser, { ready: HERO_WORKSPACE_CHIP })
    try {
      const before = await app.frame.evaluate(() => ({
        inert: document.querySelector('[data-composer-card] [aria-label="选择工作区"]') !== null,
      }))
      expect(before.inert, '夹具前置：没有会话时 composer 是官方的「选择工作区」触发器').toBe(true)

      // 品牌按钮与工具栏按钮共用 aria-label（官方 sidebar 词典 `session.new.label`），
      // 品牌按钮被全局样式隐藏，这里点的是可见的工具栏按钮。
      await app.frame.locator(SIDEBAR_NEW_SESSION).first().click()

      await expect.poll(
        async () => await app.frame.evaluate(() => document.querySelector('.dshp-hero-workspace')?.textContent?.trim() ?? null),
        { timeout: 20_000, message: '新建会话后 chip 必须显示「未分组」' },
      ).toBe('未分组')

      // composer 是否仍停在官方的「选择工作区」不可用态：宿主回填 cwd 后必然解除。
      await expect.poll(
        async () => await app.frame.evaluate(() => document.querySelector('[data-composer-card] [aria-label="选择工作区"]') !== null),
        { timeout: 20_000, message: '会话已就位，composer 不得再停在「必须先选工作区」的不可用态' },
      ).toBe(false)
      expectNoSyntheticFallbacks(app)
      expect(app.errors, '未分组新建会话不得抛出应用级错误').toEqual([])
    }
    finally {
      await app.close()
    }
  })
})
