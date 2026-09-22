import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { brand, hover, secondary } = sharedStyles

export default b('toolbar-icon-button', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: '28px',
  height: '28px',
  border: '0',
  borderRadius: '28px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-caption)',
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', {
    background: hover,
    color: secondary,
  }),
  c('&:disabled', {
    opacity: '0.5',
    cursor: 'default',
  }),
  c('&:focus-visible', {
    outline: `2px solid ${brand}`,
    outlineOffset: '1px',
  }),
])
