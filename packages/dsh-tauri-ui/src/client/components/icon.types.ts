import type { ComponentType, SVGProps } from 'react'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'as'> {
  as: IconComponent
  size?: number
}

export type SharedIconProps = Omit<SVGProps<SVGSVGElement>, 'as'> & { size?: number }
