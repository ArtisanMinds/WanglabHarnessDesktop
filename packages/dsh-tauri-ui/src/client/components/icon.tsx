import type { ReactElement } from 'react'
import type { IconProps } from './icon.types'

export function Icon({ as: Component, size = 16, ...props }: IconProps): ReactElement {
  return <Component {...props} width={size} height={size} />
}
