/**
 * components/model-picker.tsx — 模型选择器（对齐 dsh-automation create-modal 的 ModelPicker：
 * root / model / effort 三 pane + provider 分组），弹层走官方 primitives `Menu`。
 */

import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactElement } from 'react'
import type { Translate } from '../locales/index.types'
import type { ModelCatalogFailure, ModelOption } from '../types'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChevronDown, Icon, useMountStyle } from 'dsh-tauri-ui/client'
import { groupBy } from 'dsh-tauri/client'
import { useEffect, useState } from 'react'
import { MODEL_PICKER_STYLE_ID } from '../constants'
import modelPickerStyle from './model-picker.cssr'

type Pane = 'root' | 'model' | 'effort'

function optionCopy(label: string, description?: string): ReactElement {
  return (
    <span className="dshp-scheduler__model-option-copy">
      <span className="dshp-scheduler__model-name">{label}</span>
      {description !== undefined && <span className="dshp-scheduler__model-description">{description}</span>}
    </span>
  )
}

function paneRow(label: string, hint: string): ReactElement {
  return (
    <span className="dshp-scheduler__model-row">
      <span className="dshp-scheduler__model-row-label">{label}</span>
      <span className="dshp-scheduler__model-row-hint">{hint}</span>
    </span>
  )
}

export function ModelPicker({
  t,
  models,
  failures,
  modelKey,
  reasoningEffort,
  onSelection,
}: {
  readonly t: Translate
  readonly models: readonly ModelOption[]
  readonly failures: readonly ModelCatalogFailure[]
  readonly modelKey: string
  readonly reasoningEffort: string
  readonly onSelection: (modelKey: string, reasoningEffort: string) => void
}) {
  useMountStyle(modelPickerStyle, MODEL_PICKER_STYLE_ID)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const selected = models.find(item => `${item.provider}::${item.model}` === modelKey)
  const reasoning = selected?.reasoning
  const effectiveEffort = reasoningEffort === 'none'
    ? reasoning?.defaultEffort
    : reasoningEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(item => item.id === effectiveEffort)?.name ?? effectiveEffort
  const trigger = selected?.label ?? t('trigger.fallback')
  const modelGroups = Object.entries(groupBy(models, 'provider')).map(([provider, group]) => ({
    provider,
    label: group[0]?.providerLabel ?? provider,
    models: group,
  }))

  // 弹层打开时的 Escape 一律由本组件消费：子 pane 回 root，root 关闭弹层。
  // 必须拦在 capture 阶段，否则事件会同时触达外层 Modal 的 Escape（连带关掉对话框）。
  useEffect(() => {
    if (!open)
      return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (pane !== 'root') {
        setPane('root')
        return
      }
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, pane])

  const selectModel = (value: string): void => {
    const item = models.find(model => `${model.provider}::${model.model}` === value)
    onSelection(value, item?.reasoning?.defaultEffort ?? 'none')
    setOpen(false)
    setPane('root')
  }

  const selectEffort = (effort: string): void => {
    onSelection(modelKey, effort)
    setOpen(false)
    setPane('root')
  }

  const rootItems: MenuEntry[] = [
    { id: 'pane:model', label: paneRow(t('menu.model'), selected?.label ?? t('trigger.fallback')) },
  ]
  if (reasoning !== undefined)
    rootItems.push({ id: 'pane:effort', label: paneRow(t('menu.effort'), effortLabel ?? t('effort.providerDefault')) })

  const modelItems: MenuEntry[] = failures.map(failure => ({
    type: 'label',
    id: `warning:${failure.provider}`,
    text: t('warning.groupLoad', { name: failure.providerLabel, message: failure.message }),
  }))
  for (const group of modelGroups) {
    modelItems.push({ type: 'label', id: `group:${group.provider}`, text: group.label })
    for (const item of group.models)
      modelItems.push({ id: `model:${item.provider}::${item.model}`, label: optionCopy(item.label, item.description) })
  }
  if (modelItems.length === 0)
    modelItems.push({ type: 'label', id: 'empty:models', text: t('empty.models') })

  const effortItems: MenuEntry[] = []
  if (reasoning !== undefined) {
    if (reasoning.defaultEffort === undefined)
      effortItems.push({ id: 'effort:none', label: optionCopy(t('effort.providerDefault')) })
    for (const item of reasoning.efforts)
      effortItems.push({ id: `effort:${item.id}`, label: optionCopy(item.name, item.description) })
    if (effortItems.length === 0)
      effortItems.push({ type: 'label', id: 'empty:efforts', text: t('empty.efforts') })
  }

  const items = pane === 'root' ? rootItems : pane === 'model' ? modelItems : effortItems
  const selectedId = pane === 'model'
    ? `model:${modelKey}`
    : pane === 'effort'
      ? `effort:${effectiveEffort ?? 'none'}`
      : undefined

  const onSelect = (id: string): void => {
    if (id === 'pane:model') {
      setPane('model')
      return
    }
    if (id === 'pane:effort') {
      setPane('effort')
      return
    }
    if (id.startsWith('model:')) {
      selectModel(id.slice('model:'.length))
      return
    }
    if (id.startsWith('effort:'))
      selectEffort(id.slice('effort:'.length))
  }

  return (
    <Menu
      open={open}
      autoFocus
      portal
      side="top"
      align="end"
      className={`${'dshp-scheduler__model-select'}${open ? ` ${'dshp-scheduler__model-select--open'}` : ''}`}
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      onClose={() => {
        setOpen(false)
        setPane('root')
      }}
      anchor={(
        <button
          type="button"
          className="dshp-scheduler__model-trigger"
          aria-label={selected === undefined
            ? t('trigger.selectAria')
            : effortLabel === undefined
              ? t('trigger.aria', { model: selected.label })
              : t('trigger.ariaEffort', { model: selected.label, effort: effortLabel })}
          aria-haspopup="menu"
          aria-expanded={open}
          onMouseDown={event => event.stopPropagation()}
          onClick={() => {
            if (open) {
              setOpen(false)
              return
            }
            setPane('root')
            setOpen(true)
          }}
        >
          <span>{trigger}</span>
          {effortLabel !== undefined && <span className="dshp-scheduler__model-trigger-effort">{effortLabel}</span>}
          <Icon as={ChevronDown} className={`${'dshp-scheduler__model-trigger-chevron'}${open ? ` ${'dshp-scheduler__model-trigger-chevron--open'}` : ''}`} />
        </button>
      )}
    />
  )
}
