/** Compare token collection plus queries, using current shared dependencies. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import postcss from 'postcss'
import { measureAlternating } from './alternating.js'
import { benchmarkSettings } from './settings.js'
import type { collectTokens } from '../src/core/tokens.js'

const revision = process.argv[2]
if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision)) {
  throw new Error('Pass a trusted baseline commit hash: tsx bench/tokens.ts <commit>')
}
const oldSource = execFileSync('git', ['show', `${revision}:src/core/tokens.ts`], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  encoding: 'utf8',
})
async function load(source: string): Promise<typeof collectTokens> {
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
  return module.collectTokens
}
const baseline = await load(oldSource)
const current = await load(readFileSync(new URL('../src/core/tokens.ts', import.meta.url), 'utf8'))
const { iterations, warmup } = benchmarkSettings(process.env)
for (const definitions of [2, 40]) {
  const root = postcss.parse(
    Array.from(
      { length: definitions },
      (_, index) =>
        `@media (min-width: ${320 + index * 20}px) { :root { --gap: ${index + 1}px${index % 2 ? ' !important' : ''} } }`,
    ).join('\n'),
  )
  const probes = [0, ...Array.from({ length: definitions }, (_, index) => 320 + index * 20), 5000]
  const evaluate = (collect: typeof collectTokens, repeats: number) => {
    const table = collect(root)
    const values: Array<string | null> = []
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const width of probes) values.push(table.resolve('var(--gap, 0px)', width))
    }
    return values
  }
  assert.deepEqual(evaluate(current, 1), evaluate(baseline, 1))
  assert.equal(evaluate(current, 1)[0], '0px')
  for (const repeats of [1, 100]) {
    const times = await measureAlternating(
      [
        () => Promise.resolve(evaluate(baseline, repeats)),
        () => Promise.resolve(evaluate(current, repeats)),
      ],
      iterations,
      warmup,
    )
    console.log(
      JSON.stringify({
        node: process.version,
        baseline: revision,
        definitions,
        repeats,
        iterations,
        warmup,
        baselineMs: times[0],
        currentMs: times[1],
      }),
    )
  }
}
console.log(
  'Includes token collection and lookups, excludes CSS parsing; not a whole-release benchmark.',
)
