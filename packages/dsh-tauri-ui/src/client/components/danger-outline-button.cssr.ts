import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { error } = sharedStyles

// 上游 `.danger` 是 token 重绑：本地覆盖 --dsw-alias-interactive-bg-hover，让 outline 基类的 hover 洗色变红。
export default b('danger-outline-button', {
  'display': 'inline-flex',
  'alignItems': 'center',
  'justifyContent': 'center',
  'gap': '4px',
  'boxSizing': 'border-box',
  'height': '36px',
  'padding': '0 14px',
  'border': `0.5px solid color-mix(in srgb, ${error} 30%, transparent)`,
  'borderRadius': '18px',
  'background': 'transparent',
  'color': error,
  'fontSize': '14px',
  'lineHeight': '22px',
  'cursor': 'pointer',
  '--dsw-alias-interactive-bg-hover': `color-mix(in srgb, ${error} 8%, transparent)`,
}, [
  c('&:hover:not(:disabled)', { background: 'var(--dsw-alias-interactive-bg-hover)' }),
  c('&:disabled', {
    cursor: 'not-allowed',
    opacity: '0.4',
  }),
])
