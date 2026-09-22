import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b, e } } = cssr
const { hover, primary } = sharedStyles

export default b('seat-chip', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: '0',
  maxWidth: 'min(100%, 240px)',
  minHeight: '28px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '16px',
  background: 'transparent',
  color: primary,
  fontSize: '13px',
  lineHeight: '20px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}, [
  c('&:not(:disabled):hover, &[aria-expanded=\'true\']', { background: hover }),
  c('&:disabled', {
    cursor: 'default',
    color: 'var(--dsw-alias-label-quaternary)',
  }),
  e('chevron', {
    display: 'inline-flex',
    flex: '0 0 auto',
    color: 'var(--dsw-alias-label-caption)',
  }),
])
