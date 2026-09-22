import type { ReactElement } from 'react'
import type { CheckboxProps } from './checkbox.types'
import { CHECKBOX_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import checkboxStyle from './checkbox.cssr'

export function Checkbox({ checked, disabled, onChange, children, 'aria-label': ariaLabel }: CheckboxProps): ReactElement {
  useMountStyle(checkboxStyle, CHECKBOX_STYLE_ID)
  return (
    <label className="dshp-checkbox">
      <input
        className="dshp-checkbox__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={event => onChange(event.target.checked)}
      />
      {children === undefined ? null : <span className="dshp-checkbox__label">{children}</span>}
    </label>
  )
}
