import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { primaryFill, primaryFg, primaryHover } = sharedStyles

// 官方 `addButton` 是 `variant="primary" size="sm"`：几何取 Button base + `sm`，主色取 `primary`（其 `color` 覆盖 base 的 label-primary）。
export default b('add-button', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  boxSizing: 'border-box',
  height: '32px',
  padding: '0 12px',
  border: 'none',
  borderRadius: '16px',
  background: primaryFill,
  color: primaryFg,
  fontSize: '13px',
  lineHeight: '20px',
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', { background: primaryHover }),
  c('&:disabled', {
    cursor: 'not-allowed',
    opacity: '0.4',
  }),
])
