export interface UiComponentSource {
  kind: 'reexport' | 'refork'
  component: string
  variant?: string
  package: string
  version: string
  availableAt: readonly string[]
  upstreamPath: string
  mappedClass?: string
}

export interface UiComponentEntry {
  id: string
  title: string
  source: UiComponentSource
}
