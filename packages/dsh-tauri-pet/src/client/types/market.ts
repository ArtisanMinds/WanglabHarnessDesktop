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
