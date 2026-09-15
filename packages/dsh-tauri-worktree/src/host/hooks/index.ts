import { createHooks } from 'hookable'

export const hooks = createHooks<{
  'session:turn-end': (session: any, event: any) => void
}>()
