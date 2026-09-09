/** Simulated-host comparison; includes setup and teardown, not browser layout. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { measureAlternating } from './alternating.js'
import { benchmarkSettings } from './settings.js'
import type { observeAdaptiveViewport } from '../src/runtime.js'

const revision = process.argv[2]
if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision)) {
  throw new Error('Pass a trusted baseline commit hash: tsx bench/runtime.ts <commit>')
}
async function load(source: string): Promise<typeof observeAdaptiveViewport> {
  const result = await build({
    stdin: {
      contents: source,
      loader: 'ts',
      resolveDir: fileURLToPath(new URL('../src/', import.meta.url)),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`
  )
  return module.observeAdaptiveViewport
}
const baseline = await load(
  execFileSync('git', ['show', `${revision}:src/runtime.ts`], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  }),
)
const current = await load(readFileSync(new URL('../src/runtime.ts', import.meta.url), 'utf8'))
function run(observe: typeof observeAdaptiveViewport, updates: number, changing: boolean) {
  const values = new Map<string, string>()
  let writes = 0
  const host = {
    innerWidth: 390,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame() {
      return 1
    },
    cancelAnimationFrame() {},
  }
  const target = {
    style: {
      setProperty(name: string, value: string) {
        writes++
        values.set(name, value)
      },
    },
  }
  const observer = observe({
    window: host as unknown as Window,
    target: target as unknown as HTMLElement,
  })
  let snapshot = null
  try {
    for (let index = 0; index < updates; index++) {
      if (changing) host.innerHeight = 600 + (index % 200)
      snapshot = observer.update()
    }
  } finally {
    observer.destroy()
  }
  return { values, writes, snapshot }
}
const { iterations, warmup } = benchmarkSettings(process.env)
for (const updates of [0, 10000]) {
  for (const changing of [false, true]) {
    const expected = run(baseline, updates, changing)
    assert.deepEqual(run(current, updates, changing), expected)
    assert.equal(expected.values.size, 7)
    if (!changing) assert.equal(expected.writes, 7)
    const times = await measureAlternating(
      [
        () => Promise.resolve(run(baseline, updates, changing)),
        () => Promise.resolve(run(current, updates, changing)),
      ],
      iterations,
      warmup,
    )
    console.log(
      JSON.stringify({
        node: process.version,
        baseline: revision,
        updates,
        changing,
        iterations,
        warmup,
        baselineMs: times[0],
        currentMs: times[1],
      }),
    )
  }
}
console.log(
  'Simulated host and direct updates; no browser event, layout or rendering measurement. Shared dependencies are from the current checkout.',
)
