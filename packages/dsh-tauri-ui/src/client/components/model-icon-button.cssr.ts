import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { focusRing, hover, primary, tertiary } = sharedStyles

export default b('model-icon-button', {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: tertiary,
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', {
    background: hover,
    color: primary,
  }),
  c('&:disabled', {
    cursor: 'default',
    opacity: '0.4',
  }),
  c('&:focus-visible', { ...focusRing }),
])
