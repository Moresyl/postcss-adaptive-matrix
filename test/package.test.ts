import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * Checks on the published artefact rather than the source.
 *
 * Everything else in this suite imports from `src`, which is the same code but
 * not the same package: how it is wrapped, what `require` hands back and which
 * type declarations a consumer resolves are all decided by the build and by
 * `package.json`, and none of that is exercised by importing a module directly.
 * `npm run check` builds before it tests so these run against fresh output; a
 * bare `vitest run` on a clean checkout skips them rather than failing on a
 * missing `dist`.
 */
const require_ = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const built = existsSync(new URL('../dist/index.cjs', import.meta.url))
const describeBuilt = built ? describe : describe.skip

describeBuilt('the built package', () => {
  it('is callable straight off require, the shape every postcss.config.js uses', async () => {
    // `plugins: [require('postcss-adaptive-matrix')({ ... })]` is the form in
    // every PostCSS config in the wild. Exporting the plugin only as `.default`
    // makes that throw "plugin is not a function" — a failure the ESM entry
    // never shows, so it survives any amount of testing done through `import`.
    const required = require_('../dist/index.cjs') as never

    expect(typeof required).toBe('function')
    const result = await postcss([(required as CallableFunction)({})]).process(
      '.a { width: 16px }',
      { from: 'a.css' },
    )
    expect(result.css).toContain('clamp(')
  })

  it('keeps the named exports and .default reachable as properties', async () => {
    const required = require_('../dist/index.cjs') as Record<string, unknown>

    // `.default` is what consumers had to write before the entry was callable,
    // and interop layers in bundlers still reach for it.
    expect(required.default).toBe(required)
    expect(typeof required.appPcPreset).toBe('function')
    expect(typeof required.findContinuityIssues).toBe('function')
    expect(required.postcss).toBe(true)

    const imported = await import('../dist/index.js')
    expect(typeof imported.default).toBe('function')
    expect(typeof imported.appPcPreset).toBe('function')
  })

  it('leaves an entry that has no default export alone', () => {
    // The same append runs over `runtime.cjs`, which exports only by name.
    const runtime = require_('../dist/runtime.cjs') as Record<string, unknown>

    expect(typeof runtime.observeAdaptiveViewport).toBe('function')
    expect(runtime.default).toBeUndefined()
  })

  it('points require and import at their own type declarations', () => {
    // A single top-level `types` hands CJS consumers the ESM `.d.ts`. Under
    // node16 resolution that declares `export default` where the runtime has
    // `module.exports`, so the types disagree with the artefact they describe.
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, Record<string, Record<string, string>>> }

    for (const [entry, conditions] of Object.entries(manifest.exports)) {
      if (entry === './package.json') continue
      expect(conditions.require?.types).toMatch(/\.d\.cts$/)
      expect(conditions.import?.types).toMatch(/\.d\.ts$/)
      for (const target of Object.values(conditions).flatMap(Object.values)) {
        expect(existsSync(new URL(target, `file://${root}`))).toBe(true)
      }
    }
  })
})
