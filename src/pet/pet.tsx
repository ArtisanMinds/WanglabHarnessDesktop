import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import petSpriteUrl from './assets/dsh-pet-idle.png'

/**
 * 桌宠外置窗口（独立透明 Webview，label `pet`）。
 *
 * 窗口即画布（body 尺寸 = PET_WINDOW_*）：整个窗口都可以被拖动（根节点挂
 * `data-tauri-drag-region`），不显示关闭按钮——隐藏桌宠统一走插件侧
 * `hide_pet` 命令（在设置页操作），保证「宠物资源文件」的责任边界（本体来自
 * dsh-pet 的精灵图，而非自绘 CSS）。
 *
 * 精灵图取自 dsh-pet（PC2005-cloud/dsh-pet）呆味预览图第一帧，透明 PNG，
 * 窗口侧仅做轻量「呼吸/浮动」自绘动画（符合「只借静态精灵图，窗口自绘动画」）。
 * 该窗口是 Tauri 顶层 webview（非 iframe），可直接 `import { invoke }`。
 */

interface PetStatus {
  enabled: boolean
  active_pet?: string | null
}

/** 无状态时的默认展示名（取 active_pet 的最后一段，去掉版本/扩展）。 */
function petDisplayName(id: string | null | undefined): string {
  if (!id)
    return 'dsh'
  const segment = id.split(/[\\/]/).pop() ?? id
  return segment.replace(/\.(zip|png|sprites)$/i, '') || 'dsh'
}

export function PetWindow() {
  const [activePet, setActivePet] = useState<string>('dsh')

  useEffect(() => {
    let cancelled = false
    void invoke<PetStatus>('get_pet_status')
      .then((status) => {
        if (!cancelled && status.active_pet)
          setActivePet(petDisplayName(status.active_pet))
      })
      .catch((error) => {
        console.error('[pet] get_pet_status failed:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="pet-stage" data-tauri-drag-region>
      <div className="pet-canvas" role="img" aria-label={`Deepseek Harness pet: ${activePet}`}>
        <img className="pet-sprite" src={petSpriteUrl} alt="" draggable={false} decoding="async" />
        <span className="pet-name">{activePet}</span>
      </div>
    </div>
  )
}
