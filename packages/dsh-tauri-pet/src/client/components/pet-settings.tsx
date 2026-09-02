/**
 * components/pet-settings.tsx — 独立「宠物」设置页（注册进 shell.overlay）。
 * 类归档页停靠面板：启用/停用开关、选择桌宠、显示/隐藏。走 invoke 桥。
 */
import type { LocaleKey } from '../types'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { DEFAULT_PETS } from '../constants'
import { text } from '../locales'
import { fetchPetStatus, hidePet, setActivePet, setPetEnabled, showPet } from '../service/pet'
import { closePetSettings, getPetUiSnapshot, setPetStatus, subscribePetUi } from '../store'

type PetSettingsProps = Record<never, never>

export function PetSettings(_props: PetSettingsProps) {
  const { open, status } = useSyncExternalStore(subscribePetUi, getPetUiSnapshot, getPetUiSnapshot)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<LocaleKey | null>(null)
  const enabled = Boolean(status?.enabled)

  useEffect(() => {
    if (!open)
      return
    let cancelled = false
    fetchPetStatus().then((v) => {
      if (!cancelled)
        setPetStatus(v)
    }).catch(() => {})
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape')
        closePetSettings()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelled = true
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!open)
    return null

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

  return (
    <div className="dshpet-settings" role="dialog" aria-modal="false" aria-label={text('name')}>
      <header className="dshpet-settingsHead">
        <h2 className="dshpet-settingsTitle">{text('name')}</h2>
        <button type="button" className="dshpet-settingsClose" aria-label={text('close')} onClick={() => closePetSettings()}>×</button>
      </header>
      <div className="dshpet-settingsBody">
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
            <span className="dshpet-rowLabel">{text('selectPet')}</span>
            <span className={`dshpet-dot${enabled ? ' on' : ' off'}`} />
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
          <div className="dshpet-row">
            <button type="button" className="dshpet-btn" onClick={() => { void showPet().catch(() => {}) }}>{text('show')}</button>
            <button type="button" className="dshpet-btn" onClick={() => { void hidePet().catch(() => {}) }}>{text('hide')}</button>
          </div>
        </section>
        {errorMsg
          ? <p className="dshpet-error" role="alert">{text(errorMsg)}</p>
          : null}
      </div>
    </div>
  )
}
