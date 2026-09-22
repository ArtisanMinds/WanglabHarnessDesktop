import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { borderL3, primary } = sharedStyles

export default b('new-session-button', {
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  boxSizing: 'border-box',
  width: '100%',
  height: '38px',
  padding: '8px 16px',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: '500',
  lineHeight: '22px',
  color: primary,
  background: 'var(--dsw-alias-button-elevated-fill)',
  border: `0.5px solid ${borderL3}`,
  borderRadius: '12px',
  cursor: 'pointer',
  overflow: 'hidden',
}, [
  c('&:hover:not(:disabled)', { background: 'var(--dsw-alias-button-floating-hover)' }),
  c('&:disabled', {
    cursor: 'not-allowed',
    opacity: '0.5',
  }),
])
