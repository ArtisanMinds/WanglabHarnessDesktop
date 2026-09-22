import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { brand, secondary, tertiary } = sharedStyles

export default b('help-icon-button', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: '24px',
  height: '24px',
  padding: '0',
  border: '0',
  borderRadius: '6px',
  background: 'none',
  color: tertiary,
  cursor: 'pointer',
}, [
  c('&:hover, &:focus-visible, &[aria-expanded=\'true\']', {
    background: 'var(--dsw-alias-bg-layer-4)',
    color: secondary,
  }),
  c('&:focus-visible', {
    outline: `2px solid ${brand}`,
    outlineOffset: '1px',
  }),
])
