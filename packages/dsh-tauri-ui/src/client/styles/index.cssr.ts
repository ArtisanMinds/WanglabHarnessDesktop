import { TURN_NAVIGATION_SLOT_SELECTOR } from '../constants'
import { cssr } from '../utils/cssr'

const { c } = cssr

export default c(TURN_NAVIGATION_SLOT_SELECTOR, {
  display: 'block',
})
