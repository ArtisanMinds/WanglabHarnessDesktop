import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: 'src/pet',
  test: {
    include: ['state.test.ts'],
  },
})
