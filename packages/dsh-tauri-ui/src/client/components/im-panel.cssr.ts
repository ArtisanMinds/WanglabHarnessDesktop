import { cssr } from '../utils/cssr'

const { bem: { b } } = cssr

/**
 * dsh-im 面板容器几何：dsh-im 自身不持有容器的高度、留白与滚动，
 * 由宿主（这里）承担，见 dsh-im `docs/client-integration.md`。
 */
export default b('im-panel', {
  boxSizing: 'border-box',
  height: '100%',
  padding: '24px',
  overflow: 'auto',
})
