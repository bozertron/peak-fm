import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globalSetup: ['tests/setup/global-db.ts'],
    setupFiles: ['tests/setup/db-env.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    restoreMocks: true,
  },
})
