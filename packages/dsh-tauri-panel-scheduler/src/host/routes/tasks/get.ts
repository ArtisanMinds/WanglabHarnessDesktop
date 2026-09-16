import type { EventHandlerRequest } from 'dsh-tauri'
import type { GetTasksQuery, TaskListResponse } from '../index.types'
import { defineEventHandler, getQuery } from 'dsh-tauri'
import { castArray } from 'lodash-es'
import { task } from '../../service/task'

export default defineEventHandler<EventHandlerRequest, Promise<TaskListResponse>>(async (event) => {
  const raw = getQuery<GetTasksQuery>(event).search
  const search = castArray(raw)[0] ?? ''
  return { tasks: await task.list(search) }
})
