import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EditorPreference } from '../../shared/editor.types'
import type { en } from '../models/locales'
import { Button, IconChevronDownOutline14, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMountStyle } from 'dsh-tauri-ui/client'
import { useState } from 'react'
import { If } from 'react-if-lite'
import { modelStyles as styles } from '../models/styles'
import { loadEditor, saveEditor } from '../service/editor'
import { withDetail } from '../service/model-config.utils'
import { configEditorStyle } from './config-editor.cssr'

export function ConfigEditor({ t }: { t: (key: keyof typeof en) => string }) {
  useMountStyle(configEditorStyle, 'dshp-model-config-editor')
  const [menuOpen, setMenuOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [preference, setPreference] = useState<EditorPreference>()
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const items: MenuEntry[] = [
    { id: 'system', label: t('editorSystem'), icon: <span className="dshp-model-config-editor__icon dshp-model-config-editor__icon--system" aria-hidden="true" /> },
    { id: 'vscode', label: t('editorVSCode'), icon: <span className="dshp-model-config-editor__icon dshp-model-config-editor__icon--vscode" aria-hidden="true" /> },
    { id: 'cursor', label: t('editorCursor'), icon: <span className="dshp-model-config-editor__icon dshp-model-config-editor__icon--cursor" aria-hidden="true" /> },
    { id: 'separator', type: 'separator' },
    { id: 'custom', label: t('editorCustom'), icon: <span className="dshp-model-config-editor__icon dshp-model-config-editor__icon--custom" aria-hidden="true" /> },
  ]

  async function openMenu() {
    if (busy)
      return
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    setBusy(true)
    setFailure(undefined)
    try {
      setPreference(await loadEditor())
      setMenuOpen(true)
    }
    catch (error) {
      setFailure(withDetail(t('editorLoadFailed'), String(error)))
    }
    finally {
      setBusy(false)
    }
  }

  function closeDialog() {
    if (busy)
      return
    setCustomOpen(false)
    setFailure(undefined)
  }

  async function save(next: EditorPreference) {
    if (busy)
      return
    setBusy(true)
    setFailure(undefined)
    const result = await saveEditor(next)
    setBusy(false)
    if (result.ok) {
      setPreference(next)
      setCustomOpen(false)
    }
    else {
      setFailure(withDetail(t('editorSaveFailed'), result.error ?? ''))
    }
  }

  function selectEditor(editor: string) {
    if (!preference || busy)
      return
    setMenuOpen(false)
    if (editor === 'custom') {
      setCommand(preference.command)
      setCustomOpen(true)
    }
    else if (editor === 'vscode' || editor === 'cursor' || editor === 'system') {
      void save({ ...preference, editor })
    }
  }

  return (
    <>
      <Menu
        open={menuOpen}
        align="end"
        autoFocus
        items={items}
        selectedId={preference?.editor}
        onSelect={selectEditor}
        onClose={() => setMenuOpen(false)}
        anchor={(
          <button
            type="button"
            className={`${styles.linkButton} dshp-model-config-editor__trigger`}
            onClick={() => { void openMenu() }}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-busy={busy}
          >
            {t('textEditor')}
            <IconChevronDownOutline14 aria-hidden="true" />
          </button>
        )}
      />
      <Modal
        open={customOpen || failure !== undefined}
        onClose={closeDialog}
        title={customOpen ? t('editorCustom') : t('textEditor')}
        closeLabel={t('close')}
        description={t('textEditorHint')}
        className={styles.fetchDialog}
        footer={(
          <>
            <Button variant="outline" disabled={busy} onClick={closeDialog}>{customOpen ? t('cancel') : t('close')}</Button>
            <If cond={customOpen}>
              <Button disabled={busy || !command.trim()} onClick={() => { void save({ editor: 'custom', command: command.trim() }) }}>
                {t('apply')}
              </Button>
            </If>
          </>
        )}
      >
        <div className={styles.editor}>
          <If cond={customOpen}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('editorCommand')}</span>
              <input
                className={styles.input}
                value={command}
                disabled={busy}
                placeholder={t('editorCommandPlaceholder')}
                onChange={event => setCommand(event.target.value)}
              />
              <span className={styles.advancedHint}>{t('editorCommandHint')}</span>
            </label>
          </If>
          <If cond={failure !== undefined}>
            <p className={styles.error} role="alert">{failure}</p>
          </If>
        </div>
      </Modal>
    </>
  )
}
