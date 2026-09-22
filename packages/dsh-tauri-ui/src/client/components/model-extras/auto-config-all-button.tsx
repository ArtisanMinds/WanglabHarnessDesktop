import type { ReactElement } from 'react'
import type { AutoConfigAllButtonProps } from './auto-config-all-button.types'
import { MODEL_EXTRAS_STYLE_ID } from '../../constants'
import { useMountStyle } from '../../hooks/use-mount-style'
import modelExtrasStyle from './model-extras.cssr'
import { useModelConfigFetch } from './use-model-config-fetch'

export function AutoConfigAllButton({ t, models, probe, disabled, onApply }: AutoConfigAllButtonProps): ReactElement {
  useMountStyle(modelExtrasStyle, MODEL_EXTRAS_STYLE_ID)
  const { busy, failure, notice, run } = useModelConfigFetch({ t, models, probe, onApply })

  return (
    <>
      <button
        type="button"
        className="dshp-model-extras__link"
        disabled={disabled === true || busy || models.length === 0}
        title={t('autoConfigureModelsHint')}
        aria-busy={busy}
        onClick={() => run()}
      >
        {busy ? t('fetchingConfig') : t('autoConfigureModels')}
      </button>
      {failure === undefined ? null : <p className="dshp-model-extras__notice dshp-model-extras__notice--failed" role="alert">{failure}</p>}
      {notice === undefined ? null : <p className="dshp-model-extras__notice dshp-model-extras__notice--done">{notice}</p>}
    </>
  )
}
