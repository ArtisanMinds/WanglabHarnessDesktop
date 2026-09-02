/**
 * components/pet-control.tsx — 桌宠浮控件（注册进 shell.overlay 槽）。
 *
 * 单一自包含浮层（右下角胶囊按钮 + 展开的设置卡片），承担三项能力：
 *   - 开关控制：一键启用/停用桌宠（set_pet_enabled，同步外置窗口）；
 *   - 设置新增选项：显示/隐藏宠物窗口（show_pet/hide_pet），并从内置候选
 *     选择桌宠（set_active_pet，可扩展 .zip 导入）；
 *   - 设置页面：展开的面板即为「宠物」设置小页。
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { PetStatus } from '../types'
import { DEFAULT_PETS } from '../constants'
import { text } from '../locales'
import { fetchPetStatus, hidePet, setActivePet, setPetEnabled, showPet } from '../service/pet'

/** 供应商 id（组件身份，不消费 bounds；注册站点类型由 slots 体系约束）。 */
type PetControlProps = Record<never, never>

export function PetControl(_props: PetControlProps) {
  const [status, setStatus] = useState<PetStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchPetStatus()
      .then((value) => {
        if (!cancelled)
          setStatus(value)
      })
      .catch((error) => {
        console.error('[dsh-tauri-pet] fetchPetStatus failed:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function toggleEnabled() {
    if (busy || !status)
      return
    setBusy(true)
    try {
      const next = await setPetEnabled(!status.enabled)
      setStatus(next)
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setPetEnabled failed:', error)
    }
    finally {
      setBusy(false)
    }
  }

  async function choose(id: string) {
    if (busy || !status || id === status.active_pet)
      return
    setBusy(true)
    try {
      const next = await setActivePet(id)
      setStatus(next)
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setActivePet failed:', error)
    }
    finally {
      setBusy(false)
    }
  }

  async function show() {
    try {
      await showPet()
    }
    catch (error) {
      console.error('[dsh-tauri-pet] showPet failed:', error)
    }
  }

  async function hide() {
    try {
      await hidePet()
    }
    catch (error) {
      console.error('[dsh-tauri-pet] hidePet failed:', error)
    }
  }

  const enabled = Boolean(status?.enabled)

  return (
    <div className="dshpet-wrap">
      <IfPop open={open}>
        <div className="dshpet-pop" role="dialog" aria-label={text('selectPet')}>
          <div className="dshpet-row">
            <span>{text(enabled ? 'enabled' : 'disabled')}</span>
            <button className="dshpet-petBtn" type="button" disabled={busy} onClick={toggleEnabled}>
              {enabled ? text('disable') : text('enable')}
            </button>
          </div>
          <div className="dshpet-row">
            <span>{text('selectPet')}</span>
            <span className="dshpet-statusDot" style={dotStyle(enabled)} />
          </div>
          <div className="dshpet-row">
            {DEFAULT_PETS.map(pet => (
              <button
                key={pet.id}
                type="button"
                className={`dshpet-petBtn${status?.active_pet === pet.id ? ' dshpet-petBtnActive' : ''}`}
                onClick={() => choose(pet.id)}
              >
                {pet.id === 'codex' ? text('chooseCodex') : pet.label}
              </button>
            ))}
          </div>
          <div className="dshpet-row">
            <button className="dshpet-petBtn" type="button" onClick={show}>{text('show')}</button>
            <button className="dshpet-petBtn" type="button" onClick={hide}>{text('hide')}</button>
          </div>
        </div>
      </IfPop>

      <button className="dshpet-pill" type="button" onClick={() => setOpen(v => !v)}>
        <span className="dshpet-statusDot" style={dotStyle(enabled)} />
        <span>{text('name')} · {enabled ? text('enabled') : text('disabled')}</span>
      </button>
    </div>
  )
}

function dotStyle(enabled: boolean): CSSProperties {
  return { background: enabled ? '#3ddc84' : '#7a7f99' }
}

/** 极简条件渲染（避免引入 react-if-lite：无 children 声明、纯自包含）。 */
function IfPop(props: { open: boolean, children: ReactNode }) {
  if (!props.open)
    return null
  return <>{props.children}</>
}