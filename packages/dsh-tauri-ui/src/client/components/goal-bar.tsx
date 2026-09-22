import type { ReactElement } from 'react'
import type { GoalBarActionProps, GoalBarProps } from './goal-bar.types'
import { compact } from 'dsh-tauri/client'
import { useMountStyle } from '../hooks/use-mount-style'
import goalBarStyle from './goal-bar.cssr'

const GOAL_BAR_STYLE_ID = 'dsh-tauri-ui-goal-bar-styles'

export function GoalBar({
  glyph,
  label,
  objective,
  error,
  actions,
  className,
  children,
  ...rest
}: GoalBarProps): ReactElement {
  useMountStyle(goalBarStyle, GOAL_BAR_STYLE_ID)
  return (
    <div className={compact(['dshp-goal-bar', className]).join(' ')} {...rest}>
      {glyph === undefined ? null : <span className="dshp-goal-bar__glyph">{glyph}</span>}
      {label === undefined ? null : <span className="dshp-goal-bar__label">{label}</span>}
      {objective === undefined ? null : <span className="dshp-goal-bar__objective">{objective}</span>}
      {error === undefined ? null : <span className="dshp-goal-bar__error" role="alert">{error}</span>}
      {children}
      {actions === undefined ? null : <div className="dshp-goal-bar__actions">{actions}</div>}
    </div>
  )
}

export function GoalBarAction({
  variant = 'default',
  className,
  children,
  ...rest
}: GoalBarActionProps): ReactElement {
  useMountStyle(goalBarStyle, GOAL_BAR_STYLE_ID)
  return (
    <button
      type="button"
      className={compact(['dshp-goal-bar__action', variant === 'default' ? undefined : `dshp-goal-bar--${variant}`, className]).join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
