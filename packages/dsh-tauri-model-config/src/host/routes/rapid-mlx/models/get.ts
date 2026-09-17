import type { EventHandlerRequest } from 'dsh-tauri'
import type { GetRapidMlxModelsQuery, RapidMlxModelsResponse } from '../../index.types'
import { defineEventHandler, getQuery } from 'dsh-tauri'
import { rapidMlx } from '../../../service/rapid-mlx'

export default defineEventHandler<EventHandlerRequest, Promise<RapidMlxModelsResponse>>(async (event) => {
  const query = getQuery<GetRapidMlxModelsQuery>(event)
  const baseURL = typeof query.baseURL === 'string' ? query.baseURL : undefined
  const result = await rapidMlx.fetchModels(baseURL)
  if (!result.ok) {
    event.res.status = 502
    return { ok: false, error: result.error }
  }
  return { ok: true, models: result.models }
})
