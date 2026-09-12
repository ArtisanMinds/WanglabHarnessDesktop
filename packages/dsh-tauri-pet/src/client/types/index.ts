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
  frame_width: number
  frame_height: number
}

export interface PresetDownloadProgress {
  phase: 'idle' | 'downloading' | 'extracting' | 'done' | 'failed'
  received: number
  total: number
  error?: string | null
}

/**
 * 预设宠物清单条目（`resources/preset-pets.json` 的展示层投影）。
 *
 * 预设不再下载/安装：清单里的条目本身就是桌宠组件的渲染参数（`config` / `uri` /
 * `ext` 等由 pet 窗口直接消费），设置页只需要展示字段，因此这里只声明投影形状，
 * Rust 返回的其余字段前端原样忽略。
 */
export interface PresetPetItem {
  desc?: string | null
  id: string
  image?: string | null
  kind?: 'dsh' | 'codex' | null
  name: string
  size?: number | null
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
  = | 'clear'
    | 'closePet'
    | 'create'
    | 'createFailed'
    | 'download'
    | 'downloadFailed'
    | 'downloadInvalid'
    | 'downloading'
    | 'emptyPets'
    | 'enable'
    | 'enablePet'
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
    | 'wakePet'
