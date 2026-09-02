import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

/**
 * 桌宠外置窗口（独立透明 Webview，label `pet`）。
 *
 * 展现 dsh 桌宠可活动物形象；窗口即画布（body 尺寸 = PET_WINDOW_*），
 * 顶部留一条可拖动把手（`data-tauri-drag-region`），右下角关闭按钮通过
 * `hide_pet` 命令隐藏（不动 `pet_enabled`，可再次经插件桥显示）。
 *
 * 该窗口是 Tauri 顶层 webview（非 iframe），可直接 `import { invoke }`。
 */

interface PetStatus {
  enabled: boolean
  active_pet?: string | null
}

/** 无状态时的默认动物文案（取 active_pet 的最后一段，去掉版本/扩展）。 */
function petDisplayName(id: string | null | undefined): string {
  if (!id)
    return 'dsh'
  const segment = id.split(/[\\/]/).pop() ?? id
  return segment.replace(/\.(zip|png|sprites)$/i, '') || 'dsh'
}

export function PetWindow() {
  const [activePet, setActivePet] = useState<string>('dsh')
  const [bobbing, setBobbing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void invoke<PetStatus>('get_pet_status')
      .then((status) => {
        if (!cancelled && status.active_pet) {
          setActivePet(petDisplayName(status.active_pet))
        }
      })
      .catch((error) => {
        console.error('[pet] get_pet_status failed:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 周期性俏皮「点头」，让桌宠显得有生命（仅视觉，与 dsh 会话状态无关）。
  useEffect(() => {
    const timer = setTimeout(() => setBobbing(true), 1200)
    return () => clearTimeout(timer)
  }, [bobbing])

  function hide() {
    void invoke('hide_pet').catch((error) => {
      console.error('[pet] hide_pet failed:', error)
    })
  }

  return (
    <div className="pet-stage">
      <div className="pet-drag" data-tauri-drag-region>
        {/* 拖动手把：拖动即触发桌面端 Moved 保存位置 */}
      </div>

      <div className="pet-canvas" role="img" aria-label={`Deepseek Harness pet: ${activePet}`}>
        <div className={`pet-mascot${bobbing ? ' bobbing' : ''}`}>
          {/* 像素风桌宠主体（CSS 拼块），形象随 activePet 称为文案提示 */}
          <div className="pixel-body" />
          <div className="pixel-face">
            <span className="pixel-eye left" />
            <span className="pixel-eye right" />
            <span className="pixel-mouth" />
          </div>
        </div>
        <span className="pet-name">{activePet}</span>
      </div>

      <button className="pet-close" type="button" onClick={hide} title="Hide pet">
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path
            d="M1 1 L9 9 M9 1 L1 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}