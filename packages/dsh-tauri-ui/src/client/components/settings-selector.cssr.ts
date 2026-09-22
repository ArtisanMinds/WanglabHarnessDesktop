import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b, e } } = cssr
const { hover, modulePlatform, primary } = sharedStyles

export default b('settings-selector', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px',
  height: '36px',
  padding: '0 14px',
  border: 'none',
  borderRadius: '18px',
  background: modulePlatform,
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  color: primary,
  cursor: 'pointer',
}, [
  c('&:hover:not(:disabled)', { background: hover }),
  c('&:disabled', { cursor: 'default' }),
  e('chevron', {
    display: 'inline-flex',
    flex: '0 0 auto',
    color: 'var(--dsw-alias-label-caption)',
  }),
])
