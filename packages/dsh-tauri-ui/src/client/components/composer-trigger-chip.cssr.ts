import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b, e } } = cssr
const { dimmed, focusRing, hover, secondary } = sharedStyles

export default b('composer-trigger-chip', {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: '0',
  maxWidth: '220px',
  height: '28px',
  padding: '0 4px 0 8px',
  border: 'none',
  borderRadius: '24px',
  outline: 'none',
  background: 'transparent',
  color: secondary,
  fontSize: '13px',
  lineHeight: '20px',
  fontWeight: '500',
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', { background: hover }),
  c('&:focus-visible', { ...focusRing }),
  c('&:disabled', {
    color: dimmed,
    cursor: 'default',
  }),
  e('chevron', {
    display: 'inline-flex',
    flex: '0 0 auto',
    color: 'var(--dsw-alias-label-caption)',
    transition: 'transform 120ms ease',
  }, [
    c('&[data-open=\'true\']', { transform: 'rotate(180deg)' }),
  ]),
])
