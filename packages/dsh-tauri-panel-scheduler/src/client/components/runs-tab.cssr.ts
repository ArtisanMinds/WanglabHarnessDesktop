import { cssr, styles as sharedStyles } from 'dsh-tauri-ui/client'

const { c } = cssr
const { secondary, success } = sharedStyles

/** 执行记录（runs-tab.tsx）：列表 + 状态 chip；行本体复用卡片样式。 */
export default c([
  c('.dshp-scheduler__runs-list', { display: 'flex', flexDirection: 'column', gap: '8px', margin: '0', padding: '0', listStyle: 'none' }),
  c('.dshp-scheduler__chip', { flex: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '20px', padding: '1px 8px', borderRadius: '999px', fontSize: '11px', lineHeight: '18px', background: 'var(--dsw-alias-interactive-bg-hover)' }),
  c('.dshp-scheduler__chip[data-status="succeeded"]', { color: success, background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)' }),
  c('.dshp-scheduler__chip[data-status="failed"]', { color: 'var(--dsw-alias-state-error-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)' }),
  c('.dshp-scheduler__chip[data-status="running"],.dshp-scheduler__chip[data-status="queued"]', { color: secondary }),
])
