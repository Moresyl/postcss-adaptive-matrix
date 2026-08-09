import { defineConfig } from 'tsup'

const shared = {
  sourcemap: true,
  target: 'node18',
  splitting: false,
  treeshake: true,
} as const

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/runtime.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    // ESM only: the CLI reads `import.meta.url` to tell "run as a bin" from
    // "imported by a test", which has no CJS equivalent. Nothing imports the
    // bin as a library, so a single format is enough — and no `.d.ts`.
    ...shared,
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
])
