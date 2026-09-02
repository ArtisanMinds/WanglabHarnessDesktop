/**
 * components/pet-settings.tsx — 「宠物」设置分区（注册进 settings.section 槽，
 * 与 dsh-tauri-session 的归档分区同点位、同布局语言）。
 *
 * 结构（参照归档页）：页标题 + 分组卡片；启用开关、宠物大小拖动条（松手提交
 * set_pet_size）、选择宠物、显示/隐藏。所有变更走 invoke 桥；失败在页内
 * `{error && <div role="alert">}` 展示（同归档页错误条模式）。
 */
import type { LocaleKey } from '../types'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { DEFAULT_PETS, PET_DEFAULT_SIZE, PET_SIZE_MAX, PET_SIZE_MIN, PET_SIZE_STEP } from '../constants'
import { text } from '../locales'
import { fetchPetStatus, hidePet, setActivePet, setPetEnabled, setPetSize, showPet } from '../service/pet'
import { getPetUiSnapshot, setPetStatus, subscribePetUi } from '../store'

type PetSettingsProps = Record<never, never>

export function PetSettings(_props: PetSettingsProps) {
  const { status } = useSyncExternalStore(subscribePetUi, getPetUiSnapshot, getPetUiSnapshot)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<LocaleKey | null>(null)
  const [size, setSize] = useState(status?.pet_size ?? PET_DEFAULT_SIZE)
  const enabled = Boolean(status?.enabled)
  const statusSize = status?.pet_size ?? PET_DEFAULT_SIZE

  // 进入分区时拉一次状态（同归档页刷新语义），与侧栏图标共享缓存。
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

  // 状态里的尺寸被别处（重新拉取/默认值落定）更新时回填滑条。
  useEffect(() => {
    setSize(statusSize)
  }, [statusSize])

  async function toggleEnabled() {
    if (busy)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      setPetStatus(await setPetEnabled(!enabled))
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setPetEnabled failed:', error)
      setErrorMsg('setEnabledFailed')
    }
    finally {
      setBusy(false)
    }
  }

  async function choose(id: string) {
    if (busy || id === status?.active_pet)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      setPetStatus(await setActivePet(id))
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setActivePet failed:', error)
      setErrorMsg('setPetFailed')
    }
    finally {
      setBusy(false)
    }
  }

  /** 拖动条松手（pointerup / keyup）后提交，拖动过程只更新本地回显。 */
  async function commitSize() {
    if (busy || size === statusSize)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      setPetStatus(await setPetSize(size))
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setPetSize failed:', error)
      setErrorMsg('setSizeFailed')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="dshpet-page">
      <h1 className="dshpet-title">{text('name')}</h1>

      <section className="dshpet-card">
        <div className="dshpet-row">
          <span className="dshpet-rowLabel">{text(enabled ? 'enabled' : 'disabled')}</span>
          <button type="button" className={`dshpet-toggle${enabled ? ' on' : ''}`} aria-pressed={enabled} disabled={busy} onClick={() => toggleEnabled()}>
            <span className="dshpet-toggleDot" />
            {enabled ? text('disable') : text('enable')}
          </button>
        </div>
        <p className="dshpet-hint">{enabled ? text('enabledHint') : text('disabledHint')}</p>
      </section>

      <section className="dshpet-card">
        <div className="dshpet-row">
          <span className="dshpet-rowLabel">{text('sizeLabel')}</span>
          <span className="dshpet-rowValue">
            {size}
            px
          </span>
        </div>
        <input
          type="range"
          className="dshpet-slider"
          min={PET_SIZE_MIN}
          max={PET_SIZE_MAX}
          step={PET_SIZE_STEP}
          value={size}
          disabled={busy}
          aria-label={text('sizeLabel')}
          onChange={event => setSize(Number(event.target.value))}
          onPointerUp={() => {
            void commitSize()
          }}
          onKeyUp={() => {
            void commitSize()
          }}
        />
        <p className="dshpet-hint">{text('sizeHint')}</p>
      </section>

      <section className="dshpet-card">
        <div className="dshpet-row">
          <span className="dshpet-rowLabel">{text('selectPet')}</span>
        </div>
        <div className="dshpet-pets">
          {DEFAULT_PETS.map(p => (
            <button key={p.id} type="button" className={`dshpet-petBtn${status?.active_pet === p.id ? ' dshpet-petBtnActive' : ''}`} disabled={busy} onClick={() => choose(p.id)}>
              {p.id === 'codex' ? text('chooseCodex') : p.label}
            </button>
          ))}
        </div>
        <p className="dshpet-hint">{text('petWindowHint')}</p>
      </section>

      <section className="dshpet-card">
        <div className="dshpet-actions">
          <button type="button" className="dshpet-btn" onClick={() => { void showPet().catch(error => console.error('[dsh-tauri-pet] showPet failed:', error)) }}>{text('show')}</button>
          <button type="button" className="dshpet-btn" onClick={() => { void hidePet().catch(error => console.error('[dsh-tauri-pet] hidePet failed:', error)) }}>{text('hide')}</button>
        </div>
      </section>

      {errorMsg
        ? <div className="dshpet-error" role="alert">{text(errorMsg)}</div>
        : null}
    </div>
  )
}
