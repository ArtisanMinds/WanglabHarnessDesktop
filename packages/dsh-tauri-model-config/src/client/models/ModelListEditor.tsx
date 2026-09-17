import type { ReactNode } from 'react'
import type { LlmDiscoveredModel } from '../types/remotes.ts'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { en } from './locales.ts'
import type { ModelsOperations } from './operations.ts'
import { Button, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState } from 'react'
import { hasModelConfig, imageInputValue, supportsImageInput } from '../service/model-config.utils.ts'
import { formatCapacity, parseCapacity } from './DeepSeekModelsEditor.tsx'
import { modelStyles as styles } from './styles.ts'

export type ModelDraft = DeepSeekModelDraft

function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}

function numberOf(model: ModelDraft, key: string): number | undefined {
  const value = model[key]
  return typeof value === 'number' ? value : undefined
}

export interface ProbeTarget {

  settingsNs: string

  provider?: string

  baseURL?: string

  api?: string

  apiKey?: string
}

export interface ModelListEditorProps {

  models: readonly ModelDraft[]

  overridden?: boolean

  onChange: (models: ModelDraft[]) => void

  onReset?: () => void

  probe: ProbeTarget

  probeBlocked?: keyof typeof en | undefined

  operations: ModelsOperations

  t: (key: keyof typeof en) => string

  disabled: boolean

  onFetchConfig: (targets?: readonly string[]) => void

  configBusy: boolean

  configNotice?: string | undefined

  configFailure?: string | undefined
}

function IconChevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms ease' }}
    >
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTrash(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type CapacityField = 'contextWindow' | 'maxTokens'

const CAPACITY_HINT: Readonly<Record<CapacityField, string>> = {
  contextWindow: '256K',
  maxTokens: '32K',
}

function capacitySpelling(value: number | undefined): string {
  return value === undefined ? '' : formatCapacity(value)
}

function adopt(candidate: LlmDiscoveredModel): ModelDraft {
  return {
    id: candidate.id,
    ...candidate.name === undefined ? {} : { name: candidate.name },
    ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
    ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
  }
}

export function ModelListEditor(props: ModelListEditorProps): ReactNode {
  const { models, onChange, probe, operations, t, disabled, onFetchConfig, configBusy, configNotice, configFailure } = props
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [candidates, setCandidates] = useState<readonly LlmDiscoveredModel[] | undefined>(undefined)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [candidateQuery, setCandidateQuery] = useState('')

  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  const [editing, setEditing] = useState<ReadonlyMap<string, string>>(() => new Map())

  const bufferKey = (index: number, field: CapacityField): string => `${String(index)}:${field}`

  const patch = (index: number, next: Record<string, unknown>): void => {
    onChange(models.map((model, at) => {
      if (at !== index)
        return model
      const cleared = new Set(
        Object.entries(next).filter(([, value]) => value === undefined || value === '').map(([key]) => key),
      )
      return Object.fromEntries(
        Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key)),
      )
    }))
  }

  const editCapacity = (index: number, field: CapacityField, text: string): void => {
    setEditing(current => new Map(current).set(bufferKey(index, field), text))
    patch(index, { [field]: parseCapacity(text) })
  }

  const capacityText = (model: ModelDraft, index: number, field: CapacityField): string =>
    editing.get(bufferKey(index, field)) ?? capacitySpelling(numberOf(model, field))

  const reindexOnRemove = (
    current: ReadonlyMap<string, string>,
    index: number,
  ): Map<string, string> => {
    const next = new Map<string, string>()
    for (const [key, value] of current) {
      const at = Number(key.slice(0, key.indexOf(':')))
      if (at === index)
        continue

      next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value)
    }
    return next
  }

  const toggleExpanded = (index: number): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(index))
        next.add(index)
      return next
    })
  }

  const fetchModels = async (): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const answer = await operations.discoverModels(probe.settingsNs, {
        ...probe.provider === undefined ? {} : { provider: probe.provider },
        ...probe.baseURL === undefined || probe.baseURL.length === 0 ? {} : { baseURL: probe.baseURL },
        ...probe.api === undefined ? {} : { api: probe.api },
        ...probe.apiKey === undefined ? {} : { apiKey: probe.apiKey },
      })
      if (answer.kind === 'refused') {
        setFailure(answer.message)
        return
      }
      const found = answer.models
      if (found.length === 0) {
        setFailure(t('fetchEmpty'))
        return
      }

      const known = new Set(models.map(model => textOf(model, 'id')))
      setCandidateQuery('')
      setCandidates(found)
      setPicked(new Set(found.filter(model => !known.has(model.id)).map(model => model.id)))
    }
    finally {
      setBusy(false)
    }
  }

  const closePicker = (): void => {
    setCandidates(undefined)
    setPicked(new Set())
    setCandidateQuery('')
  }

  const adoptPicked = (): void => {
    if (candidates === undefined)
      return
    const byId = new Map(models.map(model => [textOf(model, 'id'), model]))
    for (const candidate of candidates) {
      if (!picked.has(candidate.id))
        continue

      byId.set(candidate.id, byId.get(candidate.id) ?? adopt(candidate))
    }
    onChange([...byId.values()])
    closePicker()
  }

  const toggle = (id: string): void => {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id))
        next.add(id)
      return next
    })
  }

  const activeCandidates = candidates ?? []
  const normalizedCandidateQuery = candidateQuery.trim().toLowerCase()
  const visibleCandidates = normalizedCandidateQuery.length === 0
    ? activeCandidates
    : activeCandidates.filter(candidate => candidate.id.toLowerCase().includes(normalizedCandidateQuery)
      || candidate.name?.toLowerCase().includes(normalizedCandidateQuery) === true)
  const allVisibleCandidatesPicked = visibleCandidates.length > 0
    && visibleCandidates.every(candidate => picked.has(candidate.id))

  const toggleVisibleCandidates = (): void => {
    setPicked((current) => {
      if (visibleCandidates.every(candidate => current.has(candidate.id))) {
        return new Set()
      }
      const next = new Set(current)
      for (const candidate of visibleCandidates) next.add(candidate.id)
      return next
    })
  }

  const askable = probe.provider !== undefined || (probe.baseURL !== undefined && probe.baseURL.length > 0)
  return (
    <section className={styles.modelCatalog} aria-label={t('models')}>
      <div className={styles.modelListHead}>
        <div className={styles.modelCatalogHeading}>
          <span className={styles.modelCatalogTitle}>{t('models')}</span>
          {props.overridden === undefined
            ? null
            : (
                <span className={styles.modelCatalogMeta}>
                  {props.overridden ? t('modelsCustomized') : t('modelsInherited')}
                </span>
              )}
        </div>
        {props.overridden === true && props.onReset !== undefined
          ? (
              <button
                type="button"
                className={styles.linkButton}
                disabled={disabled}
                onClick={props.onReset}
              >
                {t('resetModels')}
              </button>
            )
          : null}
        <button
          type="button"
          className={styles.linkButton}
          disabled={disabled || busy || !askable || props.probeBlocked !== undefined}
          title={props.probeBlocked !== undefined
            ? t(props.probeBlocked)
            : askable ? undefined : t('fetchNeedsBaseUrl')}
          onClick={() => { void fetchModels() }}
        >
          {busy ? t('fetching') : t('fetchModels')}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          disabled={disabled || configBusy || models.length === 0}
          title={t('autoConfigureModelsHint')}
          onClick={() => { onFetchConfig() }}
        >
          {configBusy ? t('fetchingConfig') : t('autoConfigureModels')}
        </button>
      </div>
      {configFailure === undefined ? null : <p className={styles.error}>{configFailure}</p>}
      {configNotice === undefined ? null : <p className={styles.advancedHint}>{configNotice}</p>}
      {models.length === 0 ? <p className={styles.modelEmpty}>{t('modelsEmpty')}</p> : null}
      {models.map((model, index) => (
        <div key={index} className={styles.modelEntry}>
          <div className={styles.modelRow}>
            <input
              className={styles.input}
              type="text"
              value={textOf(model, 'id')}
              placeholder={t('modelId')}
              aria-label={`${t('modelId')} ${index + 1}`}
              disabled={disabled}
              onChange={(event) => { patch(index, { id: event.target.value }) }}
            />
            <input
              className={styles.input}
              type="text"
              value={textOf(model, 'name')}
              placeholder={t('modelName')}
              aria-label={`${t('modelName')} ${index + 1}`}
              disabled={disabled}
              onChange={(event) => { patch(index, { name: event.target.value === '' ? undefined : event.target.value }) }}
            />
            {hasModelConfig(model)
              ? null
              : (
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={disabled || configBusy}
                    title={t('fetchModelConfigHint')}
                    onClick={() => { onFetchConfig([textOf(model, 'id')]) }}
                  >
                    {configBusy ? t('fetchingConfig') : t('fetchModelConfig')}
                  </button>
                )}
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`${t('modelAdvanced')} ${index + 1}`}
              aria-expanded={expanded.has(index)}
              title={t('modelAdvanced')}
              onClick={() => { toggleExpanded(index) }}
            >
              <IconChevron open={expanded.has(index)} />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconButtonDanger}`}
              aria-label={`${t('removeModel')} ${index + 1}`}
              title={t('removeModel')}
              disabled={disabled}
              onClick={() => {
                onChange(models.filter((_model, at) => at !== index))

                setExpanded((current) => {
                  const next = new Set<number>()
                  for (const at of current) {
                    if (at < index)
                      next.add(at)
                    else if (at > index)
                      next.add(at - 1)
                  }
                  return next
                })
                setEditing(current => reindexOnRemove(current, index))
              }}
            >
              <IconTrash />
            </button>
          </div>
          {expanded.has(index)
            ? (
                <div className={styles.modelAdvanced}>
                  <label className={styles.modelField}>
                    <span className={styles.modelFieldLabel}>{t('modelContextWindow')}</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      value={capacityText(model, index, 'contextWindow')}
                      placeholder={CAPACITY_HINT.contextWindow}
                      aria-label={`${t('modelContextWindow')} ${index + 1}`}
                      disabled={disabled}
                      onChange={(event) => { editCapacity(index, 'contextWindow', event.target.value) }}
                    />
                  </label>
                  <label className={styles.modelField}>
                    <span className={styles.modelFieldLabel}>{t('modelMaxTokens')}</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      value={capacityText(model, index, 'maxTokens')}
                      placeholder={CAPACITY_HINT.maxTokens}
                      aria-label={`${t('modelMaxTokens')} ${index + 1}`}
                      disabled={disabled}
                      onChange={(event) => { editCapacity(index, 'maxTokens', event.target.value) }}
                    />
                  </label>
                  <div className={styles.modelField}>
                    <span className={styles.modelFieldLabel} title={t('imageInputHint')}>{t('imageInput')}</span>
                    <Switch
                      checked={supportsImageInput(model)}
                      disabled={disabled}
                      label={`${t('imageInput')} ${index + 1}`}
                      title={t('imageInputHint')}
                      className={styles.modelSwitch}
                      onChange={(next) => { patch(index, { input: imageInputValue(next) }) }}
                    />
                  </div>
                </div>
              )
            : null}
        </div>
      ))}
      <button
        type="button"
        className={styles.addModelButton}
        disabled={disabled}
        onClick={() => { onChange([...models, { id: '' }]) }}
      >
        {t('addModel')}
      </button>
      {failure !== undefined ? <p className={styles.error}>{failure}</p> : null}
      <Modal
        open={candidates !== undefined}
        onClose={closePicker}
        title={t('fetchTitle')}
        closeLabel={t('close')}
        description={t('fetchDescription')}
        className={styles.fetchDialog as string}
        footer={(
          <>
            <Button variant="outline" onClick={closePicker}>{t('cancel')}</Button>
            <Button variant="outline" onClick={adoptPicked}>{t('fetchAdopt')}</Button>
          </>
        )}
      >
        <div className={styles.candidateToolbar}>
          <input
            className={`${styles.input} ${styles.candidateSearch}`}
            type="search"
            value={candidateQuery}
            placeholder={t('fetchSearch')}
            aria-label={t('fetchSearch')}
            onChange={(event) => { setCandidateQuery(event.target.value) }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={visibleCandidates.length === 0}
            onClick={toggleVisibleCandidates}
          >
            {t(allVisibleCandidatesPicked ? 'fetchDeselectAll' : 'fetchSelectAll')}
          </Button>
        </div>
        {visibleCandidates.length === 0
          ? <p className={styles.candidateEmpty} role="status">{t('fetchNoMatches')}</p>
          : (
              <ul className={styles.candidateList}>
                {visibleCandidates.map(candidate => (
                  <li key={candidate.id} className={styles.candidate}>
                    <label className={styles.candidateLabel}>
                      <input
                        type="checkbox"
                        checked={picked.has(candidate.id)}
                        onChange={() => { toggle(candidate.id) }}
                      />

                      <span className={styles.candidateId}>{candidate.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
      </Modal>
    </section>
  )
}
