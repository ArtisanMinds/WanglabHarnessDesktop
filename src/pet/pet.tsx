import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import petSpriteUrl from './assets/dsh-pet-idle.png'

/**
 * 桌宠外置窗口（独立透明 Webview，label `pet`）。
 *
 * 不显示名称/关闭按钮等附加 UI——窗口里只有宠物本体；可拖动区域与宠物本体
 * 尺寸一致（`data-tauri-drag-region` 挂在精灵图容器上，而不是整个窗口），
 * 隐藏桌宠统一走插件侧 `hide_pet` 命令（在设置页操作）。
 *
 * 大小模型：`pet_size` 是百分比（50–200，100 = 精灵图原始尺寸 220x124）。
 * 实时通道：桌面端在开关/选择/大小变化时 emit `pet://status` 事件，本窗口
 * 监听后立即缩放精灵图（拖动条拖动中即时生效）；get_pet_status 轮询仅兜底。
 * 窗口自身尺寸由 Rust 侧按同一百分比换算（desktop::pet::apply_pet_size）。
 * 该窗口是 Tauri 顶层 webview（非 iframe），可直接 `import { invoke }`。
 */

interface PetStatus {
  enabled: boolean
  active_pet?: string | null
  pet_size?: number | null
}

/** 精灵图基准宽度（dsh-pet 呆味帧 220x124；与 desktop/pet.rs 常量对齐）。 */
const PET_SPRITE_BASE_WIDTH = 220
/** 未设置 pet_size 时的默认缩放百分比（与 bridge/pet.rs 默认对齐）。 */
const PET_DEFAULT_SIZE_PERCENT = 100
/** 桌面端实时推送的状态事件（与 bridge/pet.rs PET_STATUS_EVENT 对齐）。 */
const PET_STATUS_EVENT = 'pet://status'
const PET_STATUS_POLL_MS = 1500

export function PetWindow() {
  const [petSizePercent, setPetSizePercent] = useState<number>(PET_DEFAULT_SIZE_PERCENT)

  // 实时通道：桌面端每次状态变化（含拖动中的 set_pet_size）都会推送事件。
  useEffect(() => {
    let cancelled = false
    let dispose: (() => void) | undefined
    void listen<PetStatus>(PET_STATUS_EVENT, (event) => {
      if (!cancelled)
        setPetSizePercent(event.payload.pet_size ?? PET_DEFAULT_SIZE_PERCENT)
    }).then((unlisten) => {
      // 订阅建立前组件已卸载时立即退订，避免泄漏。
      if (cancelled)
        unlisten()
      else
        dispose = unlisten
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  // 兜底轮询：事件丢失/旧版桌面端未推送时也能同步到最新设置。
  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await invoke<PetStatus>('get_pet_status')
        if (!cancelled)
          setPetSizePercent(status.pet_size ?? PET_DEFAULT_SIZE_PERCENT)
      }
      catch (error) {
        console.error('[pet] get_pet_status failed:', error)
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, PET_STATUS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // 拖动区域 = 宠物本体：宽度 = 基准尺寸 × 百分比，高度随精灵图比例。
  return (
    <div className="pet-stage">
      <div
        className="pet-canvas"
        data-tauri-drag-region
        role="img"
        aria-label="DeepSeek Harness pet"
        style={{ width: `${(PET_SPRITE_BASE_WIDTH * petSizePercent) / 100}px` }}
      >
        <img className="pet-sprite" src={petSpriteUrl} alt="" draggable={false} decoding="async" />
      </div>
    </div>
  )
}
