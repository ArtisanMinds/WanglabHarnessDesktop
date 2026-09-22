import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { hover, secondary } = sharedStyles

export default b('round-icon-button', {
  position: 'relative',
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '50%',
  cornerShape: 'round',
  padding: '0',
  background: 'transparent',
  cursor: 'pointer',
  color: secondary,
}, [
  c('&:hover:not(:disabled)', { background: hover }),
  c('&:disabled', {
    cursor: 'default',
    opacity: '0.5',
  }),
])
