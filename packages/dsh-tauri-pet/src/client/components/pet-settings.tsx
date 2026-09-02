/**
 * components/pet-settings.tsx — 「宠物」设置分区（注册进 settings.section 槽）。
 *
 * 布局遵循 issue #308 规范稿：页签（选择宠物 / Codex）+ 右侧工具栏 + 描述行 +
 * 分隔线 + 宠物卡片列表（图 + 名 + 描述 + 右侧动作按钮）。
 * - 「选择宠物」页签：工具栏 刷新 / 创建（即将支持）/ 唤醒·收起宠物；卡片 =
 *   内置宠 + 已导入包，按钮「选择/已选」；大小滑条实时提交（拖动中即生效，
 *   不显示数值）。
 * - 「Codex」页签：工具栏 刷新 / 导入（.zip，base64 上桥）；卡片 = 已导入包。
 * 所有变更走 invoke 桥；失败在页内 `{error && <div role="alert">}` 展示
 * （同 dsh-tauri-session 归档页错误条模式）。
 */
import type { ChangeEvent } from 'react'
import type { LocaleKey, PetListItem } from '../types'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DEFAULT_PETS, PET_DEFAULT_SIZE, PET_SIZE_MAX, PET_SIZE_MIN, PET_SIZE_STEP } from '../constants'
import { text } from '../locales'
import { fetchPetList, fetchPetStatus, hidePet, importPet, setActivePet, setPetEnabled, setPetSize } from '../service/pet'
import { getPetUiSnapshot, setPetStatus, subscribePetUi } from '../store'

type PetSettingsProps = Record<never, never>

// ── 工具栏图标（currentColor 跟随按钮悬停变色）────────────────────────
const REFRESH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
  </svg>
)
const PLUS_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
  </svg>
)
const CHAT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
  </svg>
)
const DOWNLOAD_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
)

interface PetCardProps {
  /** 卡片缩略图形符（内置宠/导入包用 emoji 占位，避免随包携带位图资源）。 */
  glyph: string
  name: string
  desc: string
  actionLabel: string
  actionActive: boolean
  disabled: boolean
  onAction: () => void
}

/** 宠物卡片：左图 + 中间名/描述 + 右侧动作按钮（规范稿的横向卡片）。 */
function PetCard(props: PetCardProps) {
  return (
    <div className="dshpet-cardItem">
      <span className="dshpet-cardThumb" aria-hidden="true">{props.glyph}</span>
      <span className="dshpet-cardBody">
        <span className="dshpet-cardName">{props.name}</span>
        {props.desc
          ? <span className="dshpet-cardDesc">{props.desc}</span>
          : null}
      </span>
      <button
        type="button"
        className={props.actionActive ? 'dshpet-cardAction dshpet-cardActionActive' : 'dshpet-cardAction'}
        disabled={props.disabled}
        onClick={props.onAction}
      >
        {props.actionLabel}
      </button>
    </div>
  )
}

/** File → base64（去 dataURL 前缀；供 import_pet 落盘 .zip）。 */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

export function PetSettings(_props: PetSettingsProps) {
  const { status } = useSyncExternalStore(subscribePetUi, getPetUiSnapshot, getPetUiSnapshot)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<LocaleKey | null>(null)
  const [tab, setTab] = useState<'pets' | 'codex'>('pets')
  const [imported, setImported] = useState<PetListItem[]>([])
  const [size, setSize] = useState(status?.pet_size ?? PET_DEFAULT_SIZE)
  // 最近一次提交成功的大小：回填滑条时用于识别「别处改的」vs「自己提交的回声」，
  // 避免拖动中滑条被自己上一帧的响应拽回去。
  const committedSizeRef = useRef<number | null>(null)
  const enabled = Boolean(status?.enabled)
  const statusSize = status?.pet_size ?? PET_DEFAULT_SIZE
  const activePet = status?.active_pet

  // 进入分区拉一次状态 + 导入列表（同归档页刷新语义），与侧栏图标共享缓存。
  useEffect(() => {
    void refreshAll()
  }, [])

  // 状态里的尺寸被别处更新时回填滑条；自己刚提交的值不回拽。
  useEffect(() => {
    if (statusSize !== committedSizeRef.current)
      setSize(statusSize)
  }, [statusSize])

  async function refreshAll() {
    if (busy)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      const [nextStatus, nextList] = await Promise.all([fetchPetStatus(), fetchPetList()])
      committedSizeRef.current = null
      setPetStatus(nextStatus)
      setImported(nextList)
    }
    catch (error) {
      console.error('[dsh-tauri-pet] refresh failed:', error)
      setErrorMsg('listFailed')
    }
    finally {
      setBusy(false)
    }
  }

  async function choose(id: string) {
    if (busy || id === activePet)
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

  /** 唤醒/收起宠物：唤醒 = 启用并显示；收起 = 仅隐藏窗口（不改启用设置）。 */
  async function toggleWindow() {
    if (busy)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      if (enabled)
        await hidePet()
      else
        setPetStatus(await setPetEnabled(true))
    }
    catch (error) {
      console.error('[dsh-tauri-pet] toggleWindow failed:', error)
      setErrorMsg('toggleFailed')
    }
    finally {
      setBusy(false)
    }
  }

  /** 滑条实时提交：拖动中每次 change 都落盘并经事件推送窗口即时缩放。 */
  async function commitSize(value: number) {
    setErrorMsg(null)
    try {
      const nextStatus = await setPetSize(value)
      committedSizeRef.current = value
      setPetStatus(nextStatus)
    }
    catch (error) {
      console.error('[dsh-tauri-pet] setPetSize failed:', error)
      setErrorMsg('setSizeFailed')
    }
  }

  async function onImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 重置 input，让同一文件可重复选择。
    event.target.value = ''
    if (!file || busy)
      return
    setBusy(true)
    setErrorMsg(null)
    try {
      const data = await readAsBase64(file)
      await importPet(file.name, data)
      setImported(await fetchPetList())
    }
    catch (error) {
      console.error('[dsh-tauri-pet] importPet failed:', error)
      setErrorMsg('importFailed')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="dshpet-page">
      <div className="dshpet-tabs">
        <div className="dshpet-tabList">
          <button type="button" className={tab === 'pets' ? 'dshpet-tabBtn dshpet-tabBtnActive' : 'dshpet-tabBtn'} onClick={() => setTab('pets')}>
            {text('selectPet')}
          </button>
          <button type="button" className={tab === 'codex' ? 'dshpet-tabBtn dshpet-tabBtnActive' : 'dshpet-tabBtn'} onClick={() => setTab('codex')}>
            Codex
          </button>
        </div>
        <div className="dshpet-tabTools">
          {tab === 'pets'
            ? (
                <>
                  <button type="button" className="dshpet-toolBtn" disabled={busy} onClick={() => { void refreshAll() }}>
                    {REFRESH_ICON}
                    {text('refresh')}
                  </button>
                  <button type="button" className="dshpet-toolBtn" disabled title={text('createHint')}>
                    {PLUS_ICON}
                    {text('create')}
                  </button>
                  <button type="button" className="dshpet-toolBtn" disabled={busy} onClick={() => { void toggleWindow() }}>
                    {CHAT_ICON}
                    {text(enabled ? 'collapsePet' : 'wakePet')}
                  </button>
                </>
              )
            : (
                <>
                  <button type="button" className="dshpet-toolBtn" disabled={busy} onClick={() => { void refreshAll() }}>
                    {REFRESH_ICON}
                    {text('refresh')}
                  </button>
                  <label className="dshpet-toolBtn">
                    {DOWNLOAD_ICON}
                    {text('import')}
                    <input type="file" accept=".zip" hidden disabled={busy} onChange={(event) => { void onImportFile(event) }} />
                  </label>
                </>
              )}
        </div>
      </div>
      <p className="dshpet-tabDesc">{tab === 'pets' ? text('tabInstalledDesc') : text('tabCodexDesc')}</p>
      <div className="dshpet-divider" role="separator" />

      {tab === 'pets'
        ? (
            <>
              <div className="dshpet-sizeRow">
                <span className="dshpet-sizeLabel">{text('sizeLabel')}</span>
                <input
                  type="range"
                  className="dshpet-sizeSlider"
                  min={PET_SIZE_MIN}
                  max={PET_SIZE_MAX}
                  step={PET_SIZE_STEP}
                  value={size}
                  aria-label={text('sizeLabel')}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setSize(value)
                    void commitSize(value)
                  }}
                />
              </div>
              <p className="dshpet-hint">{text('sizeHint')}</p>
              <div className="dshpet-cards">
                {DEFAULT_PETS.map(pet => (
                  <PetCard
                    key={pet.id}
                    glyph={pet.id === 'dsh' ? '🐱' : '🐶'}
                    name={text(pet.id === 'dsh' ? 'petNameDsh' : 'petNameCodex')}
                    desc={text(pet.id === 'dsh' ? 'petDescDsh' : 'petDescCodex')}
                    actionLabel={text(activePet === pet.id ? 'selected' : 'select')}
                    actionActive={activePet === pet.id}
                    disabled={busy || activePet === pet.id}
                    onAction={() => { void choose(pet.id) }}
                  />
                ))}
                {imported.map(item => (
                  <PetCard
                    key={item.id}
                    glyph="🐾"
                    name={item.name}
                    desc=""
                    actionLabel={text(activePet === item.id ? 'selected' : 'select')}
                    actionActive={activePet === item.id}
                    disabled={busy || activePet === item.id}
                    onAction={() => { void choose(item.id) }}
                  />
                ))}
              </div>
            </>
          )
        : (
            <div className="dshpet-cards">
              {imported.length === 0
                ? <div className="dshpet-empty">{text('emptyImported')}</div>
                : imported.map(item => (
                    <PetCard
                      key={item.id}
                      glyph="🐾"
                      name={item.name}
                      desc=""
                      actionLabel={text('imported')}
                      actionActive
                      disabled
                      onAction={() => {}}
                    />
                  ))}
            </div>
          )}

      {errorMsg
        ? <div className="dshpet-error" role="alert">{text(errorMsg)}</div>
        : null}
    </div>
  )
}
