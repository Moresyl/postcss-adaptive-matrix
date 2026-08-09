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
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    // Split from the ESM build only so `scripts/postbuild.ts` has a CJS-only
    // target to reshape: `module.exports` in an ESM file is a reference error.
    ...shared,
    entry: ['src/index.ts', 'src/runtime.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
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
