import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { hover } = sharedStyles

export default b('search-icon-button', {
  display: 'inline-flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}, [
  c('&:hover', { background: hover }),
])
