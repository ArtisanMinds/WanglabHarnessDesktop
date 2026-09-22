import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b } } = cssr
const { borderL4, modulePlatform, secondary, tertiary } = sharedStyles

// 上游 `versionTag` 用 `tone="neutral"`（平台灰填充），故以 neutral 为默认色；outline 保留为可选色调。
export default b('version-tag', {
  display: 'inline-flex',
  alignItems: 'center',
  flex: 'none',
  padding: '1px 8px',
  borderRadius: '999px',
  cornerShape: 'round',
  fontSize: '11px',
  lineHeight: '17px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}, [
  c('&[data-tone=\'outline\']', {
    border: `0.5px solid ${borderL4}`,
    color: tertiary,
  }),
  c('&[data-tone=\'neutral\']', {
    background: modulePlatform,
    color: secondary,
  }),
])
