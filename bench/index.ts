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
 *  2. One plugin instance processes many files, which is how a build actually
 *     runs. A fresh instance per file would hide the memoisation; re-processing
 *     one file repeatedly would exaggerate it.
 *
 *   npm run build && npm run bench
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss, { type AcceptedPlugin } from 'postcss'
import { CORPORA } from './corpus.js'
import type { adaptiveMatrix as AdaptiveMatrix } from '../src/index.js'

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
}
const adaptiveMatrix = dist.default

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 20)
const WARMUP = Number(process.env.BENCH_WARMUP ?? 5)
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function measure(run: () => Promise<unknown>): Promise<number> {
  for (let index = 0; index < WARMUP; index += 1) await run()
  const samples: number[] = []
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = process.hrtime.bigint()
    await run()
    samples.push(Number(process.hrtime.bigint() - start) / 1e6)
  }
  return median(samples)
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

console.log(
  `node ${process.version} · ${ITERATIONS} iterations (median), ${WARMUP} warmup`,
)
console.log(`${FILES_PER_CORPUS} files per corpus, one plugin instance per pass\n`)

/**
 * Library adaptation costs a selector test per rule, so it is measured rather
 * than assumed. Every built-in is enabled at once, which is the worst case and
 * more than any real project configures.
 */
const ALL_LIBRARIES = [...dist.BUILT_IN_LIBRARIES]

const rows: Record<string, string | number>[] = []
for (const corpus of CORPORA) {
  const files = intoFiles(corpus.css, FILES_PER_CORPUS)
  const bytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.css), 0)

  const parseOnly = await measure(pass([baselinePlugin], files))
  // `libraries: false` isolates unit conversion; the next pass adds them back,
  // so the difference is the library cost rather than a guess at it.
  const total = await measure(pass([adaptiveMatrix({ libraries: false })], files))
  const withLibraries = await measure(
    pass([adaptiveMatrix({ libraries: ALL_LIBRARIES })], files),
  )
  const compiler = total - parseOnly

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
console.log(
  '\n"compiler" is total minus parse+print — the only part this project controls.',
)
