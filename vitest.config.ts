import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Set just under what the suite actually reaches, so the number means
      // something. A threshold far below the real figure never fails and
      // therefore never tells anyone anything; one set exactly at it fails on
      // a refactor that moves a branch around. The gap is a couple of points.
      thresholds: {
        lines: 98,
        functions: 98,
        statements: 97,
        branches: 92,
      },
      include: ['src/**/*.ts'],
    },
  },
})
