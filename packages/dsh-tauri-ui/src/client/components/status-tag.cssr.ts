import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { borderL4, business, error, tertiary } = sharedStyles

// 上游 `.statusTag` 挂在 `<Tag tone="info">`（beta）/ `tone="danger"`（problem）上，是色调胶囊而非品牌实心，故按 tone 复刻调色板。
export default b('status-tag', {
  display: 'inline-flex',
  alignItems: 'center',
  height: '18px',
  padding: '0 7px',
  borderRadius: '999px',
  cornerShape: 'round',
  fontSize: '10px',
  lineHeight: '1',
  fontWeight: '500',
  whiteSpace: 'nowrap',
}, [
  c('&[data-tone=\'outline\']', {
    border: `0.5px solid ${borderL4}`,
    color: tertiary,
  }),
  c('&[data-tone=\'info\']', {
    background: `color-mix(in srgb, ${business} 10%, transparent)`,
    color: business,
  }),
  c('&[data-tone=\'danger\']', {
    background: `color-mix(in srgb, ${error} 10%, transparent)`,
    color: error,
  }),
])
