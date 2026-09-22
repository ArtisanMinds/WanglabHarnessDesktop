import { cssr, styles as sharedStyles } from 'dsh-tauri-ui/client'

const { c } = cssr
const { primary, secondary, tertiary, hover } = sharedStyles

/** ModelPicker（model-picker.tsx）：只保留触发控件与官方 `Menu` 行内节点的样式。 */
export default c([
  c('.dshp-scheduler__model-select', { position: 'relative', zIndex: '1', minWidth: '0', flex: 'none', height: '28px' }),
  c('.dshp-scheduler__model-select--open', { zIndex: '30' }),
  c('.dshp-scheduler__model-trigger', { display: 'flex', alignItems: 'center', gap: '4px', minWidth: '0', maxWidth: '260px', height: '28px', padding: '0 4px 0 8px', border: '0', borderRadius: '24px', background: 'transparent', color: secondary, fontSize: '13px', fontWeight: '500', lineHeight: '20px', cursor: 'pointer' }),
  c('.dshp-scheduler__model-trigger:hover', { background: hover, color: primary }),
  c('.dshp-scheduler__model-trigger > span:first-child', { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__model-trigger-effort', { flex: 'none', color: tertiary, whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__model-trigger-chevron', { flex: 'none', transition: 'transform .16s ease' }),
  c('.dshp-scheduler__model-trigger-chevron--open', { transform: 'rotate(180deg)' }),
  c('.dshp-scheduler__model-row', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%' }),
  c('.dshp-scheduler__model-row-label', { flex: 'none' }),
  c('.dshp-scheduler__model-row-hint', { flex: '1', minWidth: '0', overflow: 'hidden', color: tertiary, textAlign: 'right', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__model-option-copy', { display: 'flex', minWidth: '0', flex: '1', flexDirection: 'column' }),
  c('.dshp-scheduler__model-name', { overflow: 'hidden', fontSize: '14px', fontWeight: '500', lineHeight: '20px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__model-description', { overflow: 'hidden', color: tertiary, fontSize: '12px', lineHeight: '18px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
])
