import { cssr } from 'dsh-tauri-ui/client'

const { bem: { b, e } } = cssr

/**
 * 工作树对话框只用官方 primitives `Modal` 之外的字段与路径行样式：
 * 遮罩、卡片、标题、页脚与关闭行为由 `Modal` 承担。
 */
export default b('worktree', [
  e('dialog-form', { display: 'flex', flexDirection: 'column', gap: '14px' }),
  e('dialog-field', { display: 'flex', flexDirection: 'column', gap: '6px' }),
  e('dialog-field-label', { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary))' }),
  e('dialog-input-wrap', {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.25))',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.06))',
  }),
  e('dialog-input', {
    flex: 1,
    minWidth: 0,
    height: '36px',
    padding: '0 10px',
    border: 'none',
    background: 'none',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: '13px',
    outline: 'none',
  }),
  e('dialog-path-row', { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px', lineHeight: '18px' }),
  e('dialog-path-key', { flex: 'none', color: 'var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary))' }),
  e('dialog-path-value', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }),
  e('dialog-error', { fontSize: '12px', lineHeight: '18px', color: '#c0392b' }),
])
