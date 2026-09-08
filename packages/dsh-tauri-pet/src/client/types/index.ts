/** Shared client types for pet settings and raw session forwarding. */
export interface PetStatus {
  active_pet: string | null
  enabled: boolean
  pet_size?: number | null
  visible: boolean
  ready: boolean
  error: string | null
  render_id: number
  revision: number
}

export type PetSource = 'chat'

export interface PetListItem {
  description?: string
  id: string
  name: string
  source: PetSource
  thumbnail?: string
  sprite_rows?: number | null
}

export interface PetAsset {
  columns: number
  id: string
  rows: number
  sprite_version_number: number
  spritesheet: string
}

/** 预设宠物清单条目（`resources/preset-pets.json` 的展示层投影）。 */
export interface PresetPetItem {
  desc?: string | null
  id: string
  image?: string | null
  installed: boolean
  name: string
  size_mb?: number | null
  /** 已安装且清单 ref 与安装记录不同（或无记录）→ 可更新。 */
  update_available?: boolean
  /** 当前下载阶段（idle|downloading|extracting|done|failed），跨挂载恢复下载中视图用。 */
  phase?: PresetDownloadProgress['phase'] | null
}

/** 预设宠物下载进度快照（设置页轮询 `get_preset_download_progress`）。 */
export interface PresetDownloadProgress {
  phase: 'idle' | 'downloading' | 'extracting' | 'done' | 'failed'
  received: number
  total: number
  error?: string | null
}

export interface MarketPetItem {
  id: string
  name: string
  description: string
  author: { name: string, url: string }
  sourceUrl: string
  license: string
  licenseUrl: string
  previewUrl: string
  spritesheetUrl: string
  spriteVersion: number
  archiveUrl: string
  sha256: string
  size: number
  installed: boolean
  phase: PresetDownloadProgress['phase']
}

export interface PetMarketSnapshot {
  loading: boolean
  pets: MarketPetItem[]
  downloads: Record<string, PresetDownloadProgress>
  error: string | null
}

export interface PetMarketProps {
  active: string | null
  busy: boolean
  onChoose: (id: string) => Promise<void>
  onInstalled: () => Promise<void>
}

export interface WorkspaceItem {
  id?: string
  sessionIds?: readonly string[]
  workspaceId?: string
}

export interface PetRuntimeContext {
  sessions: {
    list: {
      getSnapshot: () => {
        current?: string
        ids: readonly string[]
      }
    }
    open?: (id: string) => void
  }
  workspaces: {
    connectWorkspace?: (id: string) => Promise<string>
    list: {
      getSnapshot: () => {
        items?: WorkspaceItem[]
        recentWorkspaceId?: string
      }
    }
  }
}

export interface PetSettingsProps {
  close?: () => void
  onCreate: (close?: () => void) => Promise<void>
}

export interface ConversationInputLeftProps {
  inputActions: {
    setDraft: (text: string) => void
  }
  sessionId: string
}

export type LocaleKey
  = | 'collapsePet'
    | 'create'
    | 'createFailed'
    | 'download'
    | 'downloadFailed'
    | 'downloadInvalid'
    | 'downloading'
    | 'emptyPets'
    | 'enable'
    | 'import'
    | 'importFailed'
    | 'listFailed'
    | 'loadFailed'
    | 'loading'
    | 'market'
    | 'marketEmpty'
    | 'marketFailed'
    | 'name'

    | 'noPetSelected'
    | 'refresh'
    | 'retry'
    | 'select'
    | 'selected'
    | 'setPetFailed'
    | 'setSizeFailed'
    | 'sizeLabel'
    | 'toggleFailed'
    | 'update'
    | 'updateFailed'
    | 'wakePet'
