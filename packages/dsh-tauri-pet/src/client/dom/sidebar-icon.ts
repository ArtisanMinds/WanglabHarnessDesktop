/**
 * dom/sidebar-icon.ts — 侧栏「桌宠入口」DOM 补丁。
 *
 * 像 dataelement/dsh-desktop 一样往侧栏塞图标：入口是 `.sidebar.settings`
 * 容器（dsh-tauri-ui 的设置触发器所在处）的子元素——紧贴 `.dshp-settings-trigger`
 * 右侧的原生按钮，样式复刻官方 `.rtSEdW_iconButton`（见 styles 的
 * .dshp-pet__icon-button）。按钮有「未激活/激活」两态；点击后在桌面端切换桌宠
 * 启用状态，不弹任何面板（设置走 settings.section 页）。
 *
 * 挂载策略参照 dsh-tauri-session 的 workspace-patch：MutationObserver 监听
 * document.body，侧栏就绪后插入并持续看护（React 重渲染容器后自动补插）；
 * guard 属性 + 位置校验防止重复插入与死循环。
 *
 * 可用性：无任何可用宠物（已安装预设或应用内宠物均无）时入口隐藏，避免
 * 展示一个点了没意义的按钮；快照由本模块挂载时拉取一次，设置页在清单变化
 * （下载完成/导入）后写回。
 */
import { PET_ICON_ATTRIBUTE, PET_ICON_RETRY_MAX, PET_ICON_RETRY_MS, PET_SETTINGS_ROW_CLASS, SETTINGS_TRIGGER_SELECTOR, SIDEBAR_SELECTOR } from '../constants'
import { subscribePetLocale, text } from '../locales'
import { fetchPetList, fetchPresetPets, registerPetStatusSync, setPetEnabled } from '../service/pet'
import { getPetUiSnapshot, setPetsAvailable, setPetStatus, subscribePetUi } from '../store'
import { hasAvailablePets } from '../utils/availability'
import { isPetVisible } from '../utils/status'

/** 入口图标（爪印，currentColor 跟随官方 iconButton 悬停变色）。 */
const PET_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 13.5c-2.7 0-5.5 2-5.5 4.3 0 1.4 1 2.2 2.3 2.2 1 0 1.9-.6 3.2-.6s2.2.6 3.2.6c1.3 0 2.3-.8 2.3-2.2 0-2.3-2.8-4.3-5.5-4.3z"/><path d="M7.3 8.1c-1 .1-1.8 1.2-1.7 2.5.1 1.2 1 2.1 2 2 .9-.1 1.7-1.2 1.6-2.4-.1-1.2-1-2.2-1.9-2.1z"/><path d="M12 4.5c-1.1 0-2 1.1-2 2.5s.9 2.5 2 2.5 2-1.1 2-2.5-.9-2.5-2-2.5z"/><path d="M16.7 8.1c-.9-.1-1.8.9-1.9 2.1-.1 1.2.7 2.3 1.6 2.4 1 .1 1.9-.8 2-2 .1-1.3-.7-2.4-1.7-2.5z"/><path d="M4.8 12.3c-.8.3-1.2 1.4-.9 2.4.3 1 1.2 1.6 2 1.3.8-.3 1.1-1.4.8-2.4-.3-1-1.1-1.6-1.9-1.3z"/><path d="M19.2 12.3c-.8-.3-1.6.3-1.9 1.3-.3 1 0 2.1.8 2.4.8.3 1.7-.3 2-1.3.3-1-.1-2.1-.9-2.4z"/></svg>'

/** 未选择宠物提示展示时长（ms）。 */
const NO_PET_HINT_MS = 2600

/** 选择与启用独立；已选择但尚未启用的宠物也可以直接唤醒。 */
function petSelected(): boolean {
  return Boolean(getPetUiSnapshot().status?.active_pet)
}

/**
 * 切换桌宠启用状态（入口按钮点击；已选择宠物后启用，失败仅记录，设置页内有
 * 完整错误展示）。
 */
async function togglePetEnabled(button: HTMLButtonElement): Promise<void> {
  const current = getPetUiSnapshot().status
  const enabled = Boolean(current?.enabled && current.visible)
  try {
    setPetStatus(await setPetEnabled(!enabled))
  }
  catch (error) {
    console.error('[dsh-tauri-pet] sidebar icon toggle failed:', error)
    flashPetHint(button, text('toggleFailed'))
  }
}

/** 点击未选择宠物时短暂展示「请在设置页选择你的宠物」提示。 */
function flashPetHint(button: HTMLButtonElement, message: string): void {
  button.setAttribute('data-tip', message)
  button.classList.add('dshp-pet__icon-hint')
  window.setTimeout(() => {
    button.classList.remove('dshp-pet__icon-hint')
    syncIconState(button)
  }, NO_PET_HINT_MS)
}

/** 创建入口按钮（绿点常驻 DOM，用 aria-pressed + 类名表达两态）。 */
function createPetIconButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'dshp-pet__icon-button'
  button.setAttribute(PET_ICON_ATTRIBUTE, '1')
  button.setAttribute('data-tip', text('name'))
  button.setAttribute('aria-label', text('name'))
  button.innerHTML = `${PET_ICON_SVG}<span class="dshp-pet__icon-dot" aria-hidden="true" />`
  button.addEventListener('click', () => {
    // 未选择宠物：只提示，不改变启用状态（选择走设置页）。
    if (!petSelected()) {
      flashPetHint(button, text('noPetSelected'))
      return
    }
    if (button.disabled)
      return
    button.disabled = true
    void togglePetEnabled(button).finally(() => {
      button.disabled = false
    })
  })
  return button
}

/** 按共享状态缓存同步按钮两态（绿点显隐 + aria-pressed）：绿点 = 宠物已开启。 */
function syncIconState(button: HTMLButtonElement): void {
  const shared = getPetUiSnapshot()
  const status = shared.status
  button.hidden = !shared.petsAvailable
  const active = isPetVisible(status)
  button.classList.toggle('dshp-pet__icon--on', active)
  button.setAttribute('aria-pressed', String(active))
  button.setAttribute('aria-label', text('name'))
  if (!button.classList.contains('dshp-pet__icon-hint'))
    button.setAttribute('data-tip', status?.error ? text('loadFailed') : text('name'))
}

/**
 * 拉取全部宠物清单并写入「是否有可用宠物」快照（侧栏入口显隐用）。失败时按
 * 有宠物处理（fail-open），避免桥接瞬时错误把入口藏掉；此后清单变化（下载
 * 完成/导入）由设置页写回同一快照。
 */
async function refreshPetsAvailability(): Promise<void> {
  try {
    const [presets, chatPets] = await Promise.all([
      fetchPresetPets(),
      fetchPetList(),
    ])
    setPetsAvailable(hasAvailablePets(presets, chatPets))
  }
  catch (error) {
    console.error('[dsh-tauri-pet] refresh pets availability failed:', error)
    setPetsAvailable(true)
  }
}

/**
 * 安装侧栏入口补丁。返回卸载函数（移除按钮、断开观察器与订阅）。
 * 桌宠状态缓存在这里初始化拉取一次；此后由设置页与按钮自身的切换写入。
 */
export function registerSidebarPetIcon(): () => void {
  if (typeof document === 'undefined')
    return () => {}

  const button = createPetIconButton()
  /** 当前打过设置行类的宿主（卸载时移除，React 重渲染换宿主时随旧节点废弃）。 */
  let rowHost: HTMLElement | undefined
  /** 上一次做过内联宽度修正的触发器（折叠态/卸载时撤销）。 */
  let patchedTrigger: HTMLElement | undefined
  /** 上次修正时触发器是否为折叠态（Rail），状态翻转时需重写内联样式。 */
  let patchedRail: boolean | undefined

  const unsubscribe = subscribePetUi(() => syncIconState(button))
  const unsubscribeLocale = subscribePetLocale(() => syncIconState(button))
  const stopStatusSync = registerPetStatusSync()
  void refreshPetsAvailability()
  syncIconState(button)

  /**
   * 把触发器宿主立成 flex 行（复刻新版 dsh 客户端 SettingsRoot 的 triggerRow）。
   * 除行类 + CSS 规则外再写一份内联样式兜底：CSS 可能被加载顺序/特异性盖过
   * （表现为图标仍被挤到下一行），而 React 对未声明 style 的节点不会清除外部
   * 内联样式；折叠态（Rail 圆形按钮）保持定宽，不做拉伸修正。
   */
  function applyRowStyles(host: HTMLElement, trigger: HTMLElement): void {
    const rail = trigger.classList.contains('dshp-settings-triggerRail')
    if (host === rowHost && trigger === patchedTrigger && rail === patchedRail)
      return
    host.classList.add(PET_SETTINGS_ROW_CLASS)
    host.style.display = 'flex'
    host.style.alignItems = 'center'
    host.style.gap = '8px'
    host.style.width = '100%'
    if (rail) {
      trigger.style.removeProperty('flex')
      trigger.style.removeProperty('width')
      trigger.style.removeProperty('min-width')
    }
    else {
      trigger.style.flex = '1 1 auto'
      trigger.style.width = 'auto'
      trigger.style.minWidth = '0'
    }
    rowHost = host
    patchedTrigger = trigger
    patchedRail = rail
  }

  /**
   * 看护入口按钮：设置触发器就绪且按钮不在其右侧时（首次挂载 / React 重渲染
   * 丢弃）重新插入；同时把触发器宿主立成 flex 行，保证图标与齿轮同行排布。
   */
  function ensurePlaced(): void {
    const trigger = document.querySelector<HTMLElement>(SETTINGS_TRIGGER_SELECTOR)
    if (!trigger?.parentElement)
      return
    applyRowStyles(trigger.parentElement, trigger)
    if (button.isConnected && button.previousElementSibling === trigger)
      return
    trigger.after(button)
    syncIconState(button)
  }

  function scan(): void {
    // 侧栏未就绪时静默跳过（由重试计时器兜底），就绪后交由观察器看护。
    if (!document.querySelector(SIDEBAR_SELECTOR))
      return
    ensurePlaced()
  }

  const observer = new MutationObserver(scan)
  let timer: ReturnType<typeof setInterval> | undefined
  let tries = 0
  /** 首次挂载：侧栏就绪后开始观察并执行首轮扫描；未就绪时轮询重试。 */
  function attach(): boolean {
    if (!document.querySelector(SIDEBAR_SELECTOR))
      return false
    observer.observe(document.body, { childList: true, subtree: true })
    scan()
    return true
  }

  if (!attach()) {
    timer = setInterval(() => {
      if (attach() || ++tries > PET_ICON_RETRY_MAX)
        clearInterval(timer)
    }, PET_ICON_RETRY_MS)
  }

  return () => {
    observer.disconnect()
    unsubscribe()
    unsubscribeLocale()
    stopStatusSync()
    button.remove()
    if (rowHost) {
      rowHost.classList.remove(PET_SETTINGS_ROW_CLASS)
      rowHost.style.removeProperty('display')
      rowHost.style.removeProperty('align-items')
      rowHost.style.removeProperty('gap')
      rowHost.style.removeProperty('width')
    }
    if (patchedTrigger) {
      patchedTrigger.style.removeProperty('flex')
      patchedTrigger.style.removeProperty('width')
      patchedTrigger.style.removeProperty('min-width')
    }
    rowHost = undefined
    patchedTrigger = undefined
    patchedRail = undefined
    if (timer !== undefined)
      clearInterval(timer)
  }
}
