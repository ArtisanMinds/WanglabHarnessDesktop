/** Shared client types for pet settings and raw session forwarding. */
export interface PetStatus {
  active_pet: string
  enabled: boolean
  pet_size?: number | null
  visible: boolean
}

export type PetSource = 'chat' | 'codex'

export interface PetListItem {
  description?: string
  id: string
  name: string
  source: PetSource
  thumbnail?: string
}

export interface PetAsset {
  columns: number
  id: string
  rows: number
  sprite_version_number: number
  spritesheet: string
}

/** 内置协议配置（dsh-pet assets/config.jsonc 协议子集），由 Rust 校验后返回。 */
export interface PetConfig {
  pets: { id: string, name?: string, size?: number }[]
  animations: {
    idle: string[]
    turn: string[]
    drag: string[]
    clicks: string[]
    moves: {
      default: Record<string, number>
      actions: { name: string, params?: Record<string, number> }[]
    }
    categories: { id: string, weight: number, noMirror?: boolean, actions: string[] }[]
    events?: Record<string, string[]>
  }
  animationWeights: { idle: number, turn: number, move: number }
  physics?: Record<string, unknown>
  eventsRefreshSec?: Record<string, number>
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
  = | 'codex'
    | 'collapsePet'
    | 'create'
    | 'createFailed'
    | 'emptyImported'
    | 'import'
    | 'importFailed'
    | 'listFailed'
    | 'name'

    | 'petDescWhale'
    | 'petNameWhale'
    | 'select'
    | 'selected'
    | 'setPetFailed'
    | 'setSizeFailed'
    | 'sizeHint'
    | 'sizeLabel'
    | 'tabCodexDesc'
    | 'tabInstalledDesc'
    | 'toggleFailed'
    | 'wakePet'
