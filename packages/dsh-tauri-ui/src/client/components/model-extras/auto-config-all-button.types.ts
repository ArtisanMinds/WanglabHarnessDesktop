import type { ModelDraft, ModelProbeTarget } from './model-config-toolbar.types'
import type { Translate } from './types'

export interface AutoConfigAllButtonProps {
  t: Translate
  models: readonly ModelDraft[]
  probe: ModelProbeTarget
  disabled?: boolean
  onApply?: (models: ModelDraft[], applied: number, undisclosed: string[]) => void
}
