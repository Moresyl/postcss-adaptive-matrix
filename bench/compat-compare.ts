/** Controlled historical comparison: no checkout or working-tree mutation. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { CORPORA } from './corpus.js'
import { benchmarkSettings } from './settings.js'
import { measureAlternating } from './alternating.js'
import type { detectFeatures } from '../src/core/compat.js'

const reference = process.argv[2]
if (!reference || !/^[a-f0-9]{7,40}$/.test(reference)) {
  throw new Error('Supply a historical commit SHA: tsx bench/compat-compare.ts <sha>')
}
const root = fileURLToPath(new URL('../', import.meta.url))
const previous = execFileSync('git', ['show', `${reference}:src/core/compat.ts`], {
  cwd: root,
  encoding: 'utf8',
})
async function detector(source?: string): Promise<typeof detectFeatures> {
  const result = await build({
    ...(source === undefined
      ? { entryPoints: ['src/core/compat.ts'], absWorkingDir: root }
      : {
          stdin: {
            contents: source,
            resolveDir: fileURLToPath(new URL('../src/core/', import.meta.url)),
            loader: 'ts' as const,
          },
        }),
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node18',
  })
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`
  )) as { detectFeatures: typeof detectFeatures }
  return module.detectFeatures
}
const before = await detector(previous)
const after = await detector(
  readFileSync(new URL('../src/core/compat.ts', import.meta.url), 'utf8'),
)
const { iterations, warmup } = benchmarkSettings(process.env)
const rows = []
for (const corpus of CORPORA) {
  assert.deepEqual(after(corpus.css), before(corpus.css), `${corpus.name}: outputs differ`)
  const timings = await measureAlternating(
    [before, after].map((detect) => () => Promise.resolve(detect(corpus.css))),
    iterations,
    warmup,
  )
  const oldTime = timings[0]!
  const newTime = timings[1]!
  rows.push({
    corpus: corpus.name,
    'before ms': oldTime.toFixed(2),
    'after ms': newTime.toFixed(2),
    ratio: (newTime / oldTime).toFixed(2),
  })
}
console.log(
  `Node ${process.version}; reference ${reference}; ${iterations} median samples, ${warmup} warmup. Dependencies use the current checkout.`,
)
console.table(rows)
