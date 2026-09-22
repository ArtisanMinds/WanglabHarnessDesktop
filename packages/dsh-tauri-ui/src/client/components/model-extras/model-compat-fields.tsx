import type { ReactElement } from 'react'
import type { ModelCompatFieldsProps } from './model-compat-fields.types'
import { MODEL_COMPAT_FIELDS_STYLE_ID } from '../../constants'
import { useMountStyle } from '../../hooks/use-mount-style'
import {
  declaredThinkingLevels,
  enableThinking,
  supportsTemplateThinking,
  supportsThinking,
  templateThinkingCompat,
  THINKING_LEVELS,
  thinkingEffortsOf,
  toggleThinkingLevel,
} from '../../service/model-compat'
import { Checkbox } from '../checkbox'
import modelCompatFieldsStyle from './model-compat-fields.cssr'

export function ModelCompatFields({
  t,
  model,
  index,
  templateCompat,
  onPatch,
  disabled,
}: ModelCompatFieldsProps): ReactElement {
  useMountStyle(modelCompatFieldsStyle, MODEL_COMPAT_FIELDS_STYLE_ID)
  const position = index + 1
  return (
    <>
      <fieldset className="dshp-model-compat" aria-label={`${t('modelConfig')} ${String(position)}`}>
        <legend className="dshp-model-compat__label">{t('modelConfig')}</legend>
        <div className="dshp-model-compat__choices">
          <Checkbox
            checked={supportsThinking(model)}
            disabled={disabled}
            aria-label={`${t('thinkingMode')} ${String(position)}`}
            title={t('thinkingModeHint')}
            onChange={(next) => { onPatch({ reasoningEfforts: next ? enableThinking(model) : false }) }}
          >
            {t('thinkingMode')}
          </Checkbox>
          {templateCompat
            ? (
                <Checkbox
                  checked={supportsTemplateThinking(model)}
                  disabled={disabled}
                  aria-label={`${t('developerRole')} ${String(position)}`}
                  title={t('developerRoleHint')}
                  onChange={(next) => { onPatch({ compat: templateThinkingCompat(model, next) }) }}
                >
                  {t('developerRole')}
                </Checkbox>
              )
            : null}
        </div>
      </fieldset>
      {supportsThinking(model)
        ? (
            <div className="dshp-model-compat__levels" role="group" aria-label={`${t('thinkingLevels')} ${String(position)}`}>
              <span className="dshp-model-compat__label">{t('thinkingLevels')}</span>
              <div className="dshp-model-compat__chips">
                {THINKING_LEVELS.map(level => (
                  <label key={level} className="dshp-model-compat__chip">
                    <input
                      type="checkbox"
                      checked={declaredThinkingLevels(model).includes(level)}
                      disabled={disabled}
                      onChange={(event) => {
                        onPatch({
                          reasoningEfforts: toggleThinkingLevel(
                            thinkingEffortsOf(model),
                            level,
                            event.target.checked,
                          ),
                        })
                      }}
                    />
                    {level}
                  </label>
                ))}
              </div>
            </div>
          )
        : null}
    </>
  )
}
