import type { PetRuntimeStatus } from '../pet-runtime'
import { useMount } from '@reause/core'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import { useListen } from '@/hooks/use-listen'
import { PET_SIZE_DEFAULT_PERCENT, PET_SIZE_MAX_PERCENT, PET_SIZE_MIN_PERCENT } from '../constants'

/**
 * 读取桌宠设置状态：挂载时拉一次 `get_pet_status`，此后跟随 `pet://status` 事件
 * （Rust 在开关/选择/大小变化时推送）。
 *
 * 返回 `null` 表示「尚未拿到状态」：调用方据此避免用缺省值闪一帧错误尺寸，
 * 也不要把 `null` 当作「已停用」。
 */
export function usePetStatus(): PetRuntimeStatus | null {
  const [status, setStatus] = useState<PetRuntimeStatus | null>(null)

  function receive(next: PetRuntimeStatus) {
    setStatus(previous => previous && previous.revision > next.revision ? previous : next)
  }

  // 挂载时拉一次初值，此后跟随 `pet://status` 推送（订阅随卸载自动注销）
  useMount(() => {
    void invoke<PetRuntimeStatus>('get_pet_status')
      .then(receive)
      .catch((error) => {
        console.warn('[pet] PET_STATUS_LOAD_FAILED:', error)
      })
  })

  useListen<PetRuntimeStatus>('pet://status', event => receive(event.payload))

  return status
}

/** 归一化宠物大小百分比（缺省 / 非法 / 越界一律收敛进合法区间）。 */
export function normalizeSizePercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return PET_SIZE_DEFAULT_PERCENT
  return Math.min(PET_SIZE_MAX_PERCENT, Math.max(PET_SIZE_MIN_PERCENT, value))
}
