import type { RunView, SchedulerOptions, TaskView } from '../../types'

export interface SchedulerUiState {
  tasks: TaskView[]
  runs: RunView[]
  options: SchedulerOptions
  loading: boolean
  error: string
  refreshedAt: number
  loadToken: number
  /** 上次「全部标记为已读」的时间戳；`0` 表示尚未播种（历史一律视为已读）。 */
  readAt: number
}
