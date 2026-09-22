import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { hover, secondary, tertiary } = sharedStyles

export default b('message-icon-action', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'calc(28px + var(--dsh-content-font-delta, 0px))',
  height: 'calc(28px + var(--dsh-content-font-delta, 0px))',
  padding: '6px',
  border: 'none',
  borderRadius: '28px',
  background: 'transparent',
  color: tertiary,
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', {
    background: hover,
    color: secondary,
  }),
  c('&:disabled', {
    cursor: 'default',
    opacity: '0.4',
  }),
])
