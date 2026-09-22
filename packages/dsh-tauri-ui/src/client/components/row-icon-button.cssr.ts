import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { primary, tertiary } = sharedStyles

export default b('row-icon-button', {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  border: 'none',
  borderRadius: '4px',
  padding: '0',
  background: 'transparent',
  cursor: 'pointer',
  color: tertiary,
}, [
  c('&:hover:not(:disabled)', { color: primary }),
  c('&:disabled', {
    cursor: 'default',
    opacity: '0.5',
  }),
])
