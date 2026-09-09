/**
 * Throughput benchmark.
 *
 * Two things this deliberately gets right, because getting them wrong produces
 * flattering nonsense:
 *
 *  1. The baseline runs a real plugin that does nothing, and always reads
 *     `result.css`. `postcss([])` returns a NoWorkResult, which by design
 *     parses and stringifies nothing — an empty plugin list cannot measure
 *     parse cost, it can only report zero.
 *  2. Each candidate reuses one plugin instance across files and sampling
 *     rounds. This measures warmed repeated builds, not cold initialization.
 *     Each pass creates a processor and processes every file in the corpus.
 *
 *   npm run build && npm run bench
 *
 * With `--check` it is also a gate. The budgets are ratios against PostCSS's
 * own parse-and-print time rather than milliseconds, because a CI runner's
 * absolute speed is not knowable in advance and a millisecond threshold would
 * either fail on a slow morning or never fail at all. Relative costs reduce
 * hardware sensitivity but do not eliminate noise, JIT or GC effects. These
 * corpus-specific budgets are not guarantees for arbitrary stylesheets.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss, { type AcceptedPlugin } from 'postcss'
import { CORPORA, CUSTOM_PROPERTY_CORPUS } from './corpus.js'
import { benchmarkSettings } from './settings.js'
import { measureAlternating } from './alternating.js'
import { verifyConversion } from './verify-conversion.js'
import { relativeAddedCost } from './ratios.js'
import type {
  adaptiveMatrix as AdaptiveMatrix,
  createAdaptiveCompiler as CreateAdaptiveCompiler,
} from '../src/index.js'

const DIST = new URL('../dist/index.js', import.meta.url)
if (!existsSync(fileURLToPath(DIST))) {
  console.error('dist/index.js is missing. Run `npm run build` first.')
  process.exit(1)
}

/**
 * The build output, not the source.
 *
 * Measuring `src` would measure whatever the loader does to it; the number that
 * matters is the one a consumer installs. The types still come from `src`, so
 * the shape used here is checked against the real signatures.
 */
const dist = (await import(DIST.href)) as {
  default: typeof AdaptiveMatrix
  BUILT_IN_LIBRARIES: readonly string[]
  createAdaptiveCompiler: typeof CreateAdaptiveCompiler
}
const adaptiveMatrix = dist.default

const { iterations: ITERATIONS, warmup: WARMUP } = benchmarkSettings(process.env)
const FILES_PER_CORPUS = 40

/**
 * A plugin that walks nothing, so PostCSS still parses and stringifies.
 *
 * `Once` is what forces the root to exist; without a visitor the pass could be
 * optimised away again and the baseline would silently return to zero.
 */
const baselinePlugin: AcceptedPlugin = { postcssPlugin: 'bench-baseline', Once() {} }

interface BenchFile {
  from: string
  css: string
}

/** Splits a stylesheet into file-sized pieces on rule boundaries. */
function intoFiles(css: string, count: number): BenchFile[] {
  // Utility sheets pack one rule per line; component sheets separate by blank
  // lines. Pick whichever separator actually yields distinct files.
  const separator = css.split('\n\n').length >= count ? '\n\n' : '\n'
  const chunks = css.split(separator)
  const perFile = Math.max(1, Math.ceil(chunks.length / count))
  const files: BenchFile[] = []
  for (let index = 0; index < chunks.length; index += perFile) {
    files.push({
      from: `/src/module-${files.length}.css`,
      css: chunks.slice(index, index + perFile).join(separator),
    })
  }
  return files
}

/** Returns a pass over every file using a single processor, forcing output. */
function pass(plugins: AcceptedPlugin[], files: BenchFile[]): () => Promise<number> {
  return async () => {
    const processor = postcss(plugins)
    let printed = 0
    for (const file of files) {
      const result = await processor.process(file.css, { from: file.from })
      printed += result.css.length
    }
    return printed
  }
}

console.log(`node ${process.version} · ${ITERATIONS} iterations (median), ${WARMUP} warmup`)
console.log(
  `${FILES_PER_CORPUS} files per corpus; plugin instances reused across sampling rounds\n`,
)

/**
 * Enable every built-in explicitly to measure added routing work. This is a
 * repeatable registry workload, not a worst-case bound for all configurations.
 */
const ALL_LIBRARIES = [...dist.BUILT_IN_LIBRARIES]

/**
 * Ceilings on this project's cost, as multiples of parse+print.
 *
 * Fixed ceilings catch regressions that cross them, not every relative
 * slowdown. Compare revisions separately to quantify smaller regressions.
 */
const BUDGET = { compiler: 1.5, libraries: 1.0 }

interface Ratio {
  corpus: string
  compiler: number
  libraries: number
}

const ratios: Ratio[] = []
const rows: Record<string, string | number>[] = []
const apiRows: Record<string, string | number>[] = []
const freshRows: Record<string, string | number>[] = []
const includeFresh = process.argv.includes('--fresh')
const includeApi = process.argv.includes('--api')
const corpora = process.argv.includes('--cache-churn')
  ? [...CORPORA, CUSTOM_PROPERTY_CORPUS]
  : CORPORA
for (const corpus of corpora) {
  const corpusOptions = { transformCustomProperties: corpus.transformCustomProperties ?? false }
  const files = intoFiles(corpus.css, FILES_PER_CORPUS)
  const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.css), 0)

  if (corpus === CUSTOM_PROPERTY_CORPUS) {
    for (const libraries of [false, ALL_LIBRARIES] as const) {
      const count = await verifyConversion(adaptiveMatrix({ ...corpusOptions, libraries }), files)
      console.log(`Preflight: ${count} custom properties converted (libraries: ${!!libraries}).`)
    }
  } else {
    for (const libraries of [false, ALL_LIBRARIES] as const) {
      const count = await verifyConversion(
        adaptiveMatrix({ ...corpusOptions, libraries }),
        files,
        'some',
        corpus.convertedProperties,
      )
      console.log(
        `Preflight: ${count} declarations converted in ${corpus.name} (libraries: ${!!libraries}).`,
      )
    }
  }

  // `libraries: false` isolates unit conversion; the next pass adds them back,
  // so the difference is the library cost rather than a guess at it.
  // Rotate all three candidates through the same sampling rounds so machine
  // drift does not systematically favor one stage of the subtraction.
  const timings = await measureAlternating(
    [
      pass([baselinePlugin], files),
      pass([adaptiveMatrix({ ...corpusOptions, libraries: false })], files),
      pass([adaptiveMatrix({ ...corpusOptions, libraries: ALL_LIBRARIES })], files),
    ],
    ITERATIONS,
    WARMUP,
  )
  const [parseOnly, total, withLibraries] = timings as [number, number, number]
  const compiler = total - parseOnly

  if (includeFresh) {
    for (const libraries of [false, ALL_LIBRARIES] as const) {
      const options = { ...corpusOptions, libraries }
      const reusedPlugin = adaptiveMatrix(options)
      const reused = postcss([reusedPlugin])
      // A fresh instance must produce the same CSS before comparing costs.
      for (const file of files) {
        const expected = await reused.process(file.css, { from: file.from })
        const actual = await postcss([adaptiveMatrix(options)]).process(file.css, {
          from: file.from,
        })
        assert.equal(actual.css, expected.css, `Fresh plugin output differs in ${file.from}`)
      }
      const [warm, fresh] = await measureAlternating(
        [pass([reusedPlugin], files), () => pass([adaptiveMatrix(options)], files)()],
        ITERATIONS,
        WARMUP,
      )
      freshRows.push({
        corpus: corpus.name,
        libraries: libraries === false ? 'off' : 'all',
        'reused (ms)': warm!.toFixed(2),
        'fresh instance (ms)': fresh!.toFixed(2),
        'delta (ms)': (fresh! - warm!).toFixed(2),
      })
    }
  }

  if (includeApi) {
    const compile = dist.createAdaptiveCompiler({ ...corpusOptions, libraries: false })
    const plugin = adaptiveMatrix({ ...corpusOptions, libraries: false })
    const processor = postcss([plugin])
    // Compare equivalent work before timing, including opt-in corpus settings.
    for (const file of files) {
      const expected = await processor.process(file.css, { from: file.from })
      const actual = await compile(file.css, { process: { from: file.from } })
      assert.equal(actual.css, expected.css, `API benchmark output differs in ${file.from}`)
    }
    const apiPass = (audit: boolean) => async () => {
      let printed = 0
      for (const file of files) {
        const result = await compile(file.css, {
          process: { from: file.from },
          ...(audit ? { targets: { safari: 14, chrome: 90 } } : {}),
        })
        printed += result.css.length
      }
      return printed
    }
    const [pluginTime, api, audited] = await measureAlternating(
      [pass([plugin], files), apiPass(false), apiPass(true)],
      ITERATIONS,
      WARMUP,
    )
    apiRows.push({
      corpus: corpus.name,
      'plugin (ms)': pluginTime!.toFixed(2),
      'reused API (ms)': api!.toFixed(2),
      'API + audit (ms)': audited!.toFixed(2),
      'audit delta (ms)': (audited! - api!).toFixed(2),
    })
  }

  ratios.push({
    corpus: corpus.name,
    compiler: relativeAddedCost(total, parseOnly),
    libraries: relativeAddedCost(withLibraries, total, parseOnly),
  })
  rows.push({
    corpus: corpus.name,
    files: files.length,
    'size (KB)': (bytes / 1024).toFixed(1),
    'parse+print (ms)': parseOnly.toFixed(2),
    'total (ms)': total.toFixed(2),
    'compiler (ms)': compiler.toFixed(2),
    'compiler share': `${((compiler / total) * 100).toFixed(0)}%`,
    [`+${ALL_LIBRARIES.length} libs (ms)`]: (withLibraries - total).toFixed(2),
    'MB/s': (bytes / 1024 / 1024 / (total / 1000)).toFixed(1),
  })
}

console.table(rows)
if (includeFresh) {
  console.table(freshRows)
  console.log(
    'Fresh instances include plugin creation once per pass, not per file. The Node process and modules stay warm; this is not process startup timing or a CI budget.',
  )
}
console.log('Baseline, compiler and library candidates rotate order each round.')
if (includeApi) {
  console.table(apiRows)
  console.log('API measurements are observational; no API budget is established yet.')
  console.log('API candidates rotate order each round; plugin timing above is measured separately.')
}
console.log('\n"compiler" estimates added cost as total minus parse+print; timing noise remains.')

if (process.argv.includes('--check')) {
  const over: string[] = []
  for (const ratio of ratios) {
    for (const [name, budget] of Object.entries(BUDGET)) {
      const measured = ratio[name as keyof typeof BUDGET]
      if (measured > budget) {
        over.push(`${ratio.corpus}: ${name} ${measured.toFixed(2)}× parse+print, budget ${budget}×`)
      }
    }
  }
  console.log(
    `\nbudget: compiler ≤ ${BUDGET.compiler}× parse+print, libraries ≤ ${BUDGET.libraries}×`,
  )
  for (const ratio of ratios) {
    console.log(
      `  ${ratio.corpus}: compiler ${ratio.compiler.toFixed(2)}×, ` +
        `libraries ${ratio.libraries.toFixed(2)}×`,
    )
  }
  if (over.length) {
    console.error(`\nover budget:\n${over.map((line) => `  ${line}`).join('\n')}`)
    process.exit(1)
  }
  console.log('\nwithin budget.')
}
