/** Observational comparison of one analyzer revision against the working tree. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import postcss from 'postcss'
import { measureAlternating } from './alternating.js'
import { benchmarkSettings } from './settings.js'
import type { findContinuityIssues } from '../src/core/continuity.js'

const revision = process.argv[2]
if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision)) {
  throw new Error('Pass an explicit baseline commit hash: tsx bench/continuity.ts <commit>')
}
const rootDirectory = fileURLToPath(new URL('../', import.meta.url))
const oldSource = execFileSync('git', ['show', `${revision}:src/core/continuity.ts`], {
  cwd: rootDirectory,
  encoding: 'utf8',
})
const currentSource = readFileSync(new URL('../src/core/continuity.ts', import.meta.url), 'utf8')
async function analyzer(source: string): Promise<typeof findContinuityIssues> {
  const result = await build({
    stdin: {
      contents: source,
      loader: 'ts',
      resolveDir: fileURLToPath(new URL('../src/core/', import.meta.url)),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`
  )
  return module.findContinuityIssues
}
const baseline = await analyzer(oldSource)
const current = await analyzer(currentSource)
const { iterations, warmup } = benchmarkSettings(process.env)
for (const count of [2, 40]) {
  const css = Array.from(
    { length: count },
    (_, breakpoint) =>
      `@media (min-width: ${320 + breakpoint * 20}px) {` +
      Array.from(
        { length: 30 },
        (_, selector) =>
          `.card-${selector} { left: calc(${count - breakpoint}vw + var(--adaptive-root-gutter))${breakpoint % 2 ? ' !important' : ''} }`,
      ).join('\n') +
      '}',
  ).join('\n')
  // This rule is inactive at the regular probes and adds its own distant seam.
  const root = postcss.parse(
    `${css}\n@media (min-width: 100000px) { .card-0 { left: 1px !important } }`,
  )
  const expected = baseline(root)
  assert.ok(expected.length > 0, 'Corpus must exercise real findings')
  assert.deepEqual(current(root), expected)
  const times = await measureAlternating(
    [() => Promise.resolve(baseline(root)), () => Promise.resolve(current(root))],
    iterations,
    warmup,
  )
  console.log(
    JSON.stringify({
      node: process.version,
      baseline: revision,
      breakpoints: count,
      distantBreakpoint: 100000,
      priority: 'alternating-important',
      selectors: 30,
      findings: expected.length,
      iterations,
      warmup,
      baselineMs: times[0],
      currentMs: times[1],
    }),
  )
}
console.log(
  'Source-level analyzer comparison; dependencies are shared, not a whole-release benchmark.',
)
