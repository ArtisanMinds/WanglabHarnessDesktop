import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import petSpriteUrl from './assets/dsh-pet-idle.png'

/**
 * 桌宠外置窗口（独立透明 Webview，label `pet`）。
 *
 * 不显示名称/关闭按钮等附加 UI——窗口里只有宠物本体；可拖动区域与宠物本体
 * 尺寸一致（`data-tauri-drag-region` 挂在精灵图容器上，而不是整个窗口），
 * 隐藏桌宠统一走插件侧 `hide_pet` 命令（在设置页操作）。
 *
 * 精灵图取自 dsh-pet（PC2005-cloud/dsh-pet）呆味预览图第一帧，透明 PNG，
 * 窗口侧仅做轻量「呼吸/浮动」自绘动画（符合「只借静态精灵图，窗口自绘动画」）。
 * 显示宽度来自设置页拖动条持久化的 `pet_size`（轮询 get_pet_status 同步）。
 * 该窗口是 Tauri 顶层 webview（非 iframe），可直接 `import { invoke }`。
 */

interface PetStatus {
  enabled: boolean
  active_pet?: string | null
  pet_size?: number | null
}

/** 未设置 pet_size 时的默认显示宽度（与插件侧 PET_DEFAULT_SIZE 对齐）。 */
const PET_DEFAULT_SIZE = 160
const PET_STATUS_POLL_MS = 1500

export function PetWindow() {
  const [petSize, setPetSize] = useState<number>(PET_DEFAULT_SIZE)

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await invoke<PetStatus>('get_pet_status')
        if (!cancelled)
          setPetSize(status.pet_size ?? PET_DEFAULT_SIZE)
      }
      catch (error) {
        console.error('[pet] get_pet_status failed:', error)
      }
    }

    void refresh()
    // 设置页调整大小/切换宠物后轮询同步，避免展示陈旧设置。
    const timer = window.setInterval(refresh, PET_STATUS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="pet-stage">
      {/* 拖动区域 = 宠物本体：宽度即 pet_size，高度随精灵图比例 */}
      <div className="pet-canvas" data-tauri-drag-region role="img" aria-label="DeepSeek Harness pet" style={{ width: `${petSize}px` }}>
        <img className="pet-sprite" src={petSpriteUrl} alt="" draggable={false} decoding="async" />
      </div>
    </div>
  )
}
