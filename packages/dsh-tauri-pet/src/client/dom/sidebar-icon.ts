/**
 * dom/sidebar-icon.ts — 侧栏「桌宠入口」DOM 补丁。
 *
 * 像 dataelement/dsh-desktop 一样往侧栏塞图标：入口是 `.sidebar.settings`
 * 容器（dsh-tauri-ui 的设置触发器所在处）的子元素——紧贴 `.dsh-tu-settingsTrigger`
 * 右侧的原生按钮，样式复刻官方 `.rtSEdW_iconButton`（见 styles 的
 * .dshpet-iconButton）。按钮只有「激活/未激活」两态：激活时右上角绿色小圆点，
 * 点击即在桌面端切换桌宠启用状态，不弹任何面板（设置走 settings.section 页）。
 *
 * 挂载策略参照 dsh-tauri-session 的 workspace-patch：MutationObserver 监听
 * document.body，侧栏就绪后插入并持续看护（React 重渲染容器后自动补插）；
 * guard 属性 + 位置校验防止重复插入与死循环。
 */
import { PET_ICON_ATTRIBUTE, PET_ICON_RETRY_MAX, PET_ICON_RETRY_MS, PET_SETTINGS_ROW_CLASS, SETTINGS_TRIGGER_SELECTOR, SIDEBAR_SELECTOR } from '../constants'
import { text } from '../locales'
import { fetchPetStatus, setPetEnabled } from '../service/pet'
import { getPetUiSnapshot, setPetStatus, subscribePetUi } from '../store'

/** 入口图标（爪印，currentColor 跟随官方 iconButton 悬停变色）。 */
const PET_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 13.5c-2.7 0-5.5 2-5.5 4.3 0 1.4 1 2.2 2.3 2.2 1 0 1.9-.6 3.2-.6s2.2.6 3.2.6c1.3 0 2.3-.8 2.3-2.2 0-2.3-2.8-4.3-5.5-4.3z"/><path d="M7.3 8.1c-1 .1-1.8 1.2-1.7 2.5.1 1.2 1 2.1 2 2 .9-.1 1.7-1.2 1.6-2.4-.1-1.2-1-2.2-1.9-2.1z"/><path d="M12 4.5c-1.1 0-2 1.1-2 2.5s.9 2.5 2 2.5 2-1.1 2-2.5-.9-2.5-2-2.5z"/><path d="M16.7 8.1c-.9-.1-1.8.9-1.9 2.1-.1 1.2.7 2.3 1.6 2.4 1 .1 1.9-.8 2-2 .1-1.3-.7-2.4-1.7-2.5z"/><path d="M4.8 12.3c-.8.3-1.2 1.4-.9 2.4.3 1 1.2 1.6 2 1.3.8-.3 1.1-1.4.8-2.4-.3-1-1.1-1.6-1.9-1.3z"/><path d="M19.2 12.3c-.8-.3-1.6.3-1.9 1.3-.3 1 0 2.1.8 2.4.8.3 1.7-.3 2-1.3.3-1-.1-2.1-.9-2.4z"/></svg>'

/** 切换桌宠启用状态（入口按钮点击；失败仅记录，设置页内有完整错误展示）。 */
async function togglePetEnabled(): Promise<void> {
  const current = getPetUiSnapshot().status
  const enabled = Boolean(current?.enabled)
  try {
    setPetStatus(await setPetEnabled(!enabled))
  }
  catch (error) {
    console.error('[dsh-tauri-pet] sidebar icon toggle failed:', error)
  }
}

/** 创建入口按钮（绿点常驻 DOM，用 aria-pressed + 类名表达两态）。 */
function createPetIconButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'dshpet-iconButton'
  button.setAttribute(PET_ICON_ATTRIBUTE, '1')
  button.setAttribute('data-tip', text('name'))
  button.setAttribute('aria-label', text('name'))
  button.innerHTML = `${PET_ICON_SVG}<span class="dshpet-iconDot" aria-hidden="true" />`
  button.addEventListener('click', () => {
    void togglePetEnabled()
  })
  return button
}

/** 按共享状态缓存同步按钮两态（绿点显隐 + aria-pressed）。 */
function syncIconState(button: HTMLButtonElement): void {
  const enabled = Boolean(getPetUiSnapshot().status?.enabled)
  button.classList.toggle('dshpet-iconOn', enabled)
  button.setAttribute('aria-pressed', String(enabled))
}

/**
 * 安装侧栏入口补丁。返回卸载函数（移除按钮、断开观察器与订阅）。
 * 桌宠状态缓存在这里初始化拉取一次；此后由设置页与按钮自身的切换写入。
 */
export function installSidebarPetIcon(): () => void {
  if (typeof document === 'undefined')
    return () => {}

  const button = createPetIconButton()
  /** 当前打过设置行类的宿主（卸载时移除，React 重渲染换宿主时随旧节点废弃）。 */
  let rowHost: HTMLElement | undefined

  const unsubscribe = subscribePetUi(() => syncIconState(button))
  void fetchPetStatus()
    .then(status => setPetStatus(status))
    .catch(error => console.error('[dsh-tauri-pet] fetchPetStatus failed:', error))
  syncIconState(button)

  /**
   * 看护入口按钮：设置触发器就绪且按钮不在其右侧时（首次挂载 / React 重渲染
   * 丢弃）重新插入；同时给宿主容器补 flex 行类——新版 dsh 客户端的
   * SettingsRoot 用 triggerRow（flex 行）承载齿轮与行内图标，旧版是通栏块级
   * 按钮，直接 after 会被挤到下一行，必须由本类把行立起来。
   */
  function ensurePlaced(): void {
    const trigger = document.querySelector<HTMLElement>(SETTINGS_TRIGGER_SELECTOR)
    if (!trigger?.parentElement)
      return
    const host = trigger.parentElement
    host.classList.add(PET_SETTINGS_ROW_CLASS)
    rowHost = host
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
    button.remove()
    rowHost?.classList.remove(PET_SETTINGS_ROW_CLASS)
    rowHost = undefined
    if (timer !== undefined)
      clearInterval(timer)
  }
}
