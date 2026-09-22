import type { ReactElement } from 'react'
import type { SearchIconButtonProps } from './search-icon-button.types'
import { compact } from 'dsh-tauri/client'
import { SEARCH_ICON_BUTTON_STYLE_ID } from '../constants'
import { useMountStyle } from '../hooks/use-mount-style'
import searchIconButtonStyle from './search-icon-button.cssr'

export function SearchIconButton({ icon, className, children, ...rest }: SearchIconButtonProps): ReactElement {
  useMountStyle(searchIconButtonStyle, SEARCH_ICON_BUTTON_STYLE_ID)
  return (
    <button type="button" className={compact(['dshp-search-icon-button', className]).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  )
}
