import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { ConfigFileOpen } from '../service/model-config.ts'
import type { en } from './locales.ts'

import type { ModelsOperations } from './operations.ts'
import type { ProviderEditorProps } from './ProviderEditor.tsx'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import type {} from './slot-contract.ts'
import type { ModelsSettingsStore, ProviderRow } from './store.ts'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { Plus } from 'dsh-tauri-ui/client'
import { useEffect, useState } from 'react'
import { ConfigEditor } from '../components/config-editor'
import { withDetail, withPath } from '../service/model-config.utils.ts'
import { ensurePresets } from '../service/presets.ts'
import { CustomProviderCard } from './CustomProviderCard.tsx'
import { ProviderEditor } from './ProviderEditor.tsx'
import { deriveKeyRef, protocolChoices, providerUsable } from './store.ts'
import { modelStyles as styles } from './styles.ts'

export interface ModelsSectionInjected {

  controller: ModelsSettingsStore
  hooks: {

    snapshot: ModelsSettingsStore['store']
  }

  operations: ModelsOperations

  schema: SettingsSchemaOperations

  t: (key: keyof typeof en) => string

  openConfig: () => Promise<ConfigFileOpen>
}

type ModelsChildSlots = 'settings.models.provider-card' | 'settings.models.footer'

type ModelsRenderSlot = PropsRenderSlots<ModelsChildSlots>['renderSlot']

export type ModelsSectionProps = Partial<InjectFace<ModelsSectionInjected>> & PropsRenderSlots<ModelsChildSlots>

type ModelsSectionFace = InjectFace<ModelsSectionInjected>

export interface ProviderIdentity {

  provider: string

  displayName: string
}

interface EditorTarget extends ProviderIdentity {
  settingsNs: string
  settingsPath: readonly string[]

  credentialRef?: string

  declared?: boolean
}

interface ProviderEditorRenderProps extends Pick<
  ProviderEditorProps,
  'namespace' | 'schema' | 'operations' | 't' | 'readOnly' | 'onClose'
> {
  target: EditorTarget
}

function renderProviderEditor({ target, ...props }: ProviderEditorRenderProps): ReactNode {
  return (
    <ProviderEditor
      provider={target.provider}
      displayName={target.displayName}
      settingsPath={target.settingsPath}
      {...target.declared === true ? { declared: true } : {}}
      {...props}
    />
  )
}

export async function removeProviderProfile(
  operations: ModelsOperations,
  controller: ModelsSettingsStore,
  target: { settingsNs: string, settingsPath: readonly string[], credentialRef?: string },
): Promise<string | undefined> {
  if (target.credentialRef !== undefined) {
    const credential = await operations.removeCredential(target.credentialRef)
    if (credential !== undefined)
      return credential
  }
  const written = await operations.writeSettings(
    target.settingsNs,
    [{ op: 'unset', path: [...target.settingsPath] }],
    undefined,
  )
  if (written.kind !== 'written')
    return written.message
  await controller.load()
  return undefined
}

export function needsSetup(row: ProviderRow, anyUsable: boolean): boolean {
  if (anyUsable)
    return false
  if (row.entry.settingsPath.length > 0)
    return false
  return row.credential?.configured !== true
}

function keyConfiguredOf(row: ProviderRow): boolean {
  return row.apiKeyEnv !== undefined
    ? row.credential?.configured === true
    : row.derivedCredential?.configured === true
}

function targetOf(row: ProviderRow): EditorTarget {
  const managedRef = deriveKeyRef(row.entry.provider)
  const credentialRef = row.apiKeyEnv === managedRef
    && row.credential?.configured === true
    && row.credential.writable
    ? managedRef
    : undefined
  return {
    provider: row.entry.provider,
    displayName: row.entry.displayName,
    settingsNs: row.entry.settingsNs,
    settingsPath: row.entry.settingsPath,
    ...credentialRef === undefined ? {} : { credentialRef },

    ...row.entry.declared === true ? { declared: true } : {},
  }
}

export function providerTargetLabel(target: ProviderIdentity): string {
  return target.provider === target.displayName
    ? target.provider
    : `${target.displayName} (${target.provider})`
}

export function providerCopy(template: string, target: ProviderIdentity): string {
  return template.replace('{provider}', () => providerTargetLabel(target))
}

export function ModelsSection(props: ModelsSectionProps): ReactNode {
  const { controller, useSnapshot, operations, schema, t, openConfig, renderSlot } = props
  if (
    controller === undefined || useSnapshot === undefined || operations === undefined
    || schema === undefined || t === undefined || openConfig === undefined
  ) {
    return null
  }
  return <Loaded injected={{ controller, useSnapshot, operations, schema, t, openConfig }} renderSlot={renderSlot} />
}

function Loaded({ injected, renderSlot }: { injected: ModelsSectionFace, renderSlot: ModelsRenderSlot }): ReactNode {
  const { controller, operations, schema, t } = injected
  const state = injected.useSnapshot(snapshot => snapshot)
  const [editing, setEditing] = useState<EditorTarget | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EditorTarget | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | undefined>(undefined)
  const [savedTarget, setSavedTarget] = useState<ProviderIdentity | undefined>(undefined)
  const [declaring, setDeclaring] = useState(false)
  const [dismissedSetup, setDismissedSetup] = useState<ReadonlySet<string>>(() => new Set())
  const [configOpen, setConfigOpen] = useState<{ text: string, failed: boolean } | undefined>(undefined)

  // 能力表是自动配置填图片与思考的来源，进页面就先取回来，别让第一次点击等下载。
  useEffect(() => {
    void ensurePresets()
  }, [])

  const openConfigFile = (): void => {
    setConfigOpen(undefined)
    void injected.openConfig().then((outcome) => {
      setConfigOpen(outcome.ok
        ? {
            text: withPath(outcome.opened === 'file' ? t('openConfigFileLanded') : t('openConfigFileDirectory'), outcome.path),
            failed: false,
          }
        : { text: withDetail(t('openConfigFileFailed'), outcome.error), failed: true })
    })
  }

  const announceSaved = (target: ProviderIdentity): void => {
    void controller.load().then(() => {
      setSavedTarget(target)
    })
  }

  const closeEditor = (changed: boolean, target: ProviderIdentity): void => {
    setEditing(undefined)
    setAdding(false)
    setDeclaring(false)
    if (changed)
      announceSaved(target)
  }

  const closeSetup = (changed: boolean, target: ProviderIdentity): void => {
    setDismissedSetup(previous => new Set([...previous, target.provider]))
    if (changed)
      announceSaved(target)
  }

  const closeDelete = (): void => {
    if (deleting)
      return
    setDeleteTarget(undefined)
    setDeleteFailure(undefined)
  }

  const confirmDelete = (): void => {
    if (deleteTarget === undefined || deleting)
      return
    setDeleting(true)
    setDeleteFailure(undefined)
    void removeProviderProfile(operations, controller, deleteTarget)
      .then((failure) => {
        if (failure !== undefined) {
          setDeleteFailure(failure)
          return
        }
        setDeleteTarget(undefined)
      })
      .finally(() => { setDeleting(false) })
  }

  if (state.status === 'idle')
    void controller.load()
  if (state.status === 'error') {
    const errorText = state.error ?? ''
    return (
      <div className={styles.section}>
        <p className={styles.error}>{`${t('loadFailed')}: ${errorText}`}</p>
        <button type="button" className={styles.secondaryButton} onClick={() => { void controller.load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  const savedRow = savedTarget === undefined
    ? undefined
    : state.rows.find(row => row.entry.provider === savedTarget.provider)
  const savedIdentity = savedRow === undefined
    ? savedTarget
    : { provider: savedRow.entry.provider, displayName: savedRow.entry.displayName }

  const anyUsable = state.rows.some(providerUsable)
  const configured = state.rows.filter(row => row.configured)
  const configurable = state.rows.filter(row => state.namespaces.has(row.entry.settingsNs))
  const addable = configurable.filter(row => !row.configured)
  const addTarget = adding ? editing : undefined
  const addNamespace = addTarget === undefined ? undefined : state.namespaces.get(addTarget.settingsNs)

  const addRow = addTarget === undefined
    ? undefined
    : state.rows.find(row => row.entry.provider === addTarget.provider)

  const protocols = protocolChoices(state.namespaces.get('llm-pi-ai'), schema)

  return (
    <div className={styles.section}>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{t('title')}</h2>
        <div className={styles.rowActions}>
          <ConfigEditor t={t} />
          <button
            type="button"
            className={styles.linkButton}
            title={t('openConfigFileHint')}
            onClick={openConfigFile}
          >
            {t('openConfigFile')}
          </button>
        </div>
      </div>
      <p className={styles.intro}>{t('intro')}</p>
      {configOpen === undefined
        ? null
        : (
            <p
              role={configOpen.failed ? 'alert' : 'status'}
              className={configOpen.failed ? styles.error : styles.savedNotice}
            >
              {configOpen.text}
            </p>
          )}
      {!state.writable && state.status === 'ready' ? <p className={styles.notice}>{t('readOnly')}</p> : null}
      {savedIdentity === undefined
        ? null
        : (
            <p className={styles.savedNotice} role="status" aria-live="polite">
              {providerCopy(t('savedProvider'), savedIdentity)}
            </p>
          )}
      <ul className={styles.rows}>
        {configured.map((row) => {
          const target = targetOf(row)
          const namespace = state.namespaces.get(target.settingsNs)

          if (namespace === undefined)
            return null
          const error = row.entry.error === undefined
            ? null
            : <p role="alert" className={styles.error}>{row.entry.error}</p>
          if (needsSetup(row, anyUsable) && !dismissedSetup.has(row.entry.provider)) {
            return (
              <li key={row.entry.provider} className={styles.setupCard}>
                {error}
                {renderProviderEditor({
                  target,
                  namespace,
                  schema,
                  operations,
                  t,
                  readOnly: !state.writable,
                  onClose: (changed) => { closeSetup(changed, target) },
                })}
                {renderSlot(
                  'settings.models.provider-card',
                  { provider: row.entry, configured: row.configured, keyConfigured: keyConfiguredOf(row) },
                  { entryKey: row.entry.settingsNs },
                )}
              </li>
            )
          }
          const open = !adding && editing?.provider === row.entry.provider
          const credentialConfigured = row.credential?.configured === true
          const credentialMissing = !credentialConfigured
            && row.apiKeyEnv !== undefined
            && row.credential?.configured === false
          return (
            <li key={row.entry.provider} className={styles.rowCard}>
              <div className={styles.rowHead}>
                <span className={styles.rowIdentity}>
                  <span className={styles.rowName}>{row.entry.displayName}</span>

                  {row.entry.declared === true
                    ? <span className={styles.rowTag}>{t('customTag')}</span>
                    : null}
                  {credentialConfigured
                    ? (
                        <span
                          className={`${styles.credentialDot} ${styles.credentialDotConfigured}`}
                          role="img"
                          aria-label={t('credentialConfigured')}
                          title={t('credentialConfigured')}
                        />
                      )
                    : credentialMissing
                      ? (
                          <span
                            className={`${styles.credentialDot} ${styles.credentialDotMissing}`}
                            role="img"
                            aria-label={t('credentialMissing')}
                            title={t('credentialMissing')}
                          />
                        )
                      : null}
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    aria-label={providerCopy(t('editProvider'), target)}
                    onClick={() => {
                      setSavedTarget(undefined)

                      setDeclaring(false)
                      setAdding(false)
                      setEditing(open ? undefined : target)
                    }}
                  >
                    {t('edit')}
                  </button>
                  {row.removable
                    ? (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          aria-label={providerCopy(t('removeProvider'), target)}
                          disabled={!state.writable}
                          onClick={() => {
                            setSavedTarget(undefined)
                            setDeleteFailure(undefined)
                            setDeleteTarget(target)
                          }}
                        >
                          {t('remove')}
                        </button>
                      )
                    : null}
                </span>
              </div>
              {error}
              {renderSlot(
                'settings.models.provider-card',
                { provider: row.entry, configured: row.configured, keyConfigured: keyConfiguredOf(row) },
                { entryKey: row.entry.settingsNs },
              )}
              {open
                ? renderProviderEditor({
                    target,
                    namespace,
                    schema,
                    operations,
                    t,
                    readOnly: !state.writable,
                    onClose: (changed) => { closeEditor(changed, target) },
                  })
                : null}
            </li>
          )
        })}
      </ul>
      <div className={styles.addBlock}>
        {addTarget !== undefined && addNamespace !== undefined
          ? (
              <div className={styles.addCard}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('provider')}</span>
                  <select
                    className={`${styles.input} ${styles.selectInput}`}
                    value={addTarget.provider}
                    aria-label={t('provider')}
                    onChange={(event) => {
                      const row = addable.find(candidate => candidate.entry.provider === event.target.value)

                      if (row === undefined)
                        return
                      setEditing(targetOf(row))
                    }}
                  >
                    {addable.map(row => (
                      <option key={row.entry.provider} value={row.entry.provider}>{row.entry.displayName}</option>
                    ))}
                  </select>
                </div>
                <ProviderEditor
                  key={addTarget.provider}
                  provider={addTarget.provider}
                  displayName={addTarget.displayName}
                  hideTitle
                  namespace={addNamespace}
                  schema={schema}
                  settingsPath={addTarget.settingsPath}
                  operations={operations}
                  t={t}
                  readOnly={!state.writable}
                  onClose={(changed) => { closeEditor(changed, addTarget) }}
                />
                {addRow === undefined
                  ? null
                  : renderSlot(
                      'settings.models.provider-card',
                      { provider: addRow.entry, configured: addRow.configured, keyConfigured: keyConfiguredOf(addRow) },
                      { entryKey: addRow.entry.settingsNs },
                    )}
              </div>
            )
          : declaring
            ? (
                <div className={styles.addCard}>
                  <CustomProviderCard
                    taken={state.rows.map(row => row.entry.provider)}
                    protocols={protocols}

                    revision={state.namespaces.get('llm-pi-ai')?.revision ?? 0}
                    operations={operations}
                    t={t}
                    readOnly={!state.writable}
                    onClose={(changed) => {
                      setDeclaring(false)
                      if (changed)
                        void controller.load()
                    }}
                  />
                </div>
              )
            : (

                <div className={styles.addActions}>
                  {configurable.length > 0 && (
                    <button
                      type="button"
                      className={styles.addButton}
                      disabled={addable.length === 0 || !state.writable}
                      onClick={() => {
                        const first = addable[0]

                        if (first === undefined)
                          return
                        setSavedTarget(undefined)
                        setDeclaring(false)
                        setAdding(true)
                        setEditing(targetOf(first))
                      }}
                    >
                      <Plus width={14} height={14} />
                      {t('add')}
                    </button>
                  )}
                  {state.namespaces.has('llm-pi-ai') && (
                    <button
                      type="button"
                      className={styles.addButton}
                      disabled={protocols.length === 0 || !state.writable}
                      onClick={() => {
                        setSavedTarget(undefined)
                        setAdding(false)
                        setEditing(undefined)
                        setDeclaring(true)
                      }}
                    >
                      <Plus width={14} height={14} />
                      {t('customAdd')}
                    </button>
                  )}
                </div>
              )}
      </div>
      {renderSlot('settings.models.footer', {})}
      <Modal
        open={deleteTarget !== undefined}
        onClose={closeDelete}
        title={deleteTarget === undefined ? '' : providerCopy(t('deleteTitle'), deleteTarget)}
        closeLabel={t('close')}
        description={deleteTarget === undefined
          ? ''
          : providerCopy(
              deleteTarget.credentialRef === undefined
                ? t('deleteDescription')
                : t('deleteDescriptionWithCredential'),
              deleteTarget,
            )}
        className={styles.deleteDialog as string}
        footer={(
          <>
            <Button variant="outline" autoFocus disabled={deleting} onClick={closeDelete}>
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              className={styles.deleteConfirm}
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleteTarget === undefined
                ? ''
                : providerCopy(deleting ? t('deleting') : t('deleteConfirm'), deleteTarget)}
            </Button>
          </>
        )}
      >
        {deleteFailure === undefined ? null : <p className={styles.error}>{deleteFailure}</p>}
      </Modal>
    </div>
  )
}
