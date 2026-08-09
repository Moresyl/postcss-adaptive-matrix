import { appendFile } from 'node:fs/promises'
import { defineConfig } from 'tsup'

const shared = {
  sourcemap: true,
  target: 'node18',
  splitting: false,
  treeshake: true,
} as const

/**
 * Makes `module.exports` the plugin itself rather than an object holding it
 * under `.default`.
 *
 * Every `postcss.config.js` in the wild is written
 * `plugins: [require('postcss-adaptive-matrix')({ ... })]`, and against an
 * exports object that throws "plugin is not a function" — the one call shape
 * most consumers reach for first. `Object.assign` keeps every named export
 * reachable as a property, `.default` included, so both spellings work.
 *
 * tsup's own `cjsInterop` does not cover this: it applies only when the entry
 * has a lone default export, and this one also exports helpers by name. An
 * esbuild `footer` does not work either — tsup appends its `exports.x = x`
 * lines after it, so the line would run before `default` had been assigned and
 * quietly do nothing. Hence a real post-build append.
 *
 * The guard is for `runtime.cjs`, which has only named exports and must be
 * left alone.
 */
const CJS_DEFAULT_EXPORT =
  '\nif (module.exports.default) ' +
  'module.exports = Object.assign(module.exports.default, module.exports);\n'

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/runtime.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    // Split from the ESM build only so the append below can target CJS alone:
    // `module.exports` in an ESM file is a reference error.
    ...shared,
    entry: ['src/index.ts', 'src/runtime.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
    async onSuccess() {
      await appendFile('dist/index.cjs', CJS_DEFAULT_EXPORT, 'utf8')
    },
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
