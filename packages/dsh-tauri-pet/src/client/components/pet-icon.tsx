import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  PET_ICON_OFFSET_BOTTOM,
  PET_ICON_OFFSET_RIGHT,
  RAIL_ICON_SIZE,
  SIDEBAR_SELECTOR,
} from '../constants'
import { text } from '../locales'
import { fetchPetStatus } from '../service/pet'
import {
  getPetUiSnapshot,
  openPetSettings,
  setPetStatus,
  subscribePetUi,
} from '../store'

/**
 * components/pet-icon.tsx — 侧栏「宠物入口」小图标（注册进 shell.overlay）。
 * 出现在侧栏底部设置入口的右侧，仅一个图标：桌宠启用时右上角出现绿色小圆点。
 * 点击打开独立「宠物」设置页（pet-settings）。
 * shell.overlay 是全屏固定层且默认点击穿透；本条目用 `position: fixed` 自钉在
 * 侧栏右下角，运行时测量 `[data-slot="sidebar"]` 的矩形并随其重排，测量不到
 * 时退回默认（~76 近 rail 位置）。
 */

type PetIconProps = Record<never, never>

interface SidebarGeometry {
  left: number
  top: number
  width: number
  height: number
  rail: boolean
}

function measureSidebar(): SidebarGeometry | null {
  const el = document.querySelector(SIDEBAR_SELECTOR)
  if (!el)
    return null
  const rect = el.getBoundingClientRect()
  if (!rect.width && !rect.height)
    return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, rail: rect.width < 96 }
}

export function PetIcon(_props: PetIconProps) {
  const state = useSyncExternalStore(subscribePetUi, getPetUiSnapshot, getPetUiSnapshot)
  const [geometry, setGeometry] = useState<SidebarGeometry | null>(() => measureSidebar())

  useEffect(() => {
    let cancelled = false
    fetchPetStatus().then((value) => {
      if (!cancelled)
        setPetStatus(value)
    }).catch((error) => {
      console.error('[dsh-tauri-pet] fetchPetStatus failed:', error)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 跟随侧栏宽度/折叠变化（resize + 短轮询兜底）。初始几何由 lazy useState 计算，
  // 不在 effect 里同步 setState（避免 lint 反模式）。
  useEffect(() => {
    function resync(): void {
      setGeometry(measureSidebar())
    }
    const onResize = (): void => resync()
    const timer = window.setInterval(resync, 800)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(timer)
    }
  }, [])

  const enabled = Boolean(state.status?.enabled)
  const g = geometry
  const rail = g?.rail ?? false
  const size = rail ? RAIL_ICON_SIZE : 30
  const style: React.CSSProperties = g
    ? { left: g.left + g.width - size - PET_ICON_OFFSET_RIGHT, top: g.top + g.height - size - PET_ICON_OFFSET_BOTTOM }
    : { left: 76 - size / 2, bottom: PET_ICON_OFFSET_BOTTOM }

  return (
    <button
      type="button"
      className={`dshpet-icon${rail ? ' dshpet-iconRail' : ''}${enabled ? ' dshpet-iconOn' : ''}`}
      style={style}
      title={text('name')}
      aria-label={text('name')}
      aria-haspopup="dialog"
      aria-expanded={state.open}
      onClick={() => openPetSettings()}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} aria-hidden="true" fill="currentColor">
        <path d="M12 2c1.5 0 2.8.8 3.5 2 .9-.3 1.9-.2 2.7.4.9.7 1.3 1.7 1.1 2.8 1.9.3 3.2 2 3.2 3.8 0 1.5-.9 2.9-2.2 3.5-.5 2.9-2.7 5-5.7 5h-1.7c-3.3 0-6.1-1.1-7.3-3.6C3.7 14.1 3.5 11 4.6 8.3 5.7 5.7 8.4 4 11.2 4c.3-1.2 1.2-2 2.2-2z" />
      </svg>
      {enabled && <span className="dshpet-iconDot" aria-hidden="true" />}
    </button>
  )
}
