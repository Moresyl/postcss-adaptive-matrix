/**
 * Checks the built-in library registry against what those libraries actually
 * ship.
 *
 * Every entry in the registry is a claim made on the user's behalf — this class
 * prefix, this token prefix, this design canvas — and a wrong one is silent:
 * lengths get rescaled against a canvas the library was never drawn on, or skip
 * rescaling they needed. Claims like that should not rest on having read the
 * documentation once.
 *
 * Run it manually; it downloads packages and is not part of `npm run check`:
 *
 *     npx tsx scripts/verify-libraries.ts
 *     npx tsx scripts/verify-libraries.ts vant nutui
 *
 * What it can check is what is observable in the published stylesheet: whether
 * the class prefix and token prefix appear at all, how much of the file they
 * cover, whether compiling is idempotent, and whether the seam check fires.
 * The design width is not observable in CSS and is not checked here — it comes
 * from each library's own documentation and is recorded in docs/libraries.md.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss from 'postcss'

import { findContinuityIssues } from '../src/core/continuity.js'
import { resolveOptions } from '../src/core/options.js'
import { createProfileResolver } from '../src/core/resolve.js'
import { adaptiveMatrix } from '../src/postcss/plugin.js'

interface Target {
  /** Registry key. */
  library: string
  /** npm package that ships the stylesheet. */
  npm: string
  /** Claimed class prefix. */
  prefix: string
  /** Claimed custom-property prefix, when the library themes through one. */
  tokenPrefix?: string
  /** Path inside the package, when the largest stylesheet is the wrong one. */
  stylesheet?: string
  /** Canvas the routing is expected to pick, as `library:<name>`. */
  canvas?: string
  /**
   * Styles are generated at runtime, so the package ships no stylesheet.
   *
   * Nothing here can be checked against a file, and nothing needs to be: CSS
   * that never exists on disk never reaches PostCSS. The entry still earns its
   * place — these libraries are `designWidth: false`, and a project that
   * extracts their styles, or writes `.ant-btn` overrides by hand, gets those
   * lengths left alone rather than rescaled.
   */
  runtimeStyles?: boolean
}

const TARGETS: Target[] = [
  { library: 'vant', npm: 'vant', prefix: 'van-', tokenPrefix: '--van-' },
  { library: 'nutui', npm: '@nutui/nutui', prefix: 'nut-', tokenPrefix: '--nut-' },
  // No tokenPrefix: Varlet names its custom properties `--field-padding`,
  // `--icon-size-md` and so on, with no prefix of its own to claim.
  { library: 'varlet', npm: '@varlet/ui', prefix: 'var-' },
  {
    library: 'antd-mobile',
    npm: 'antd-mobile',
    prefix: 'adm-',
    tokenPrefix: '--adm-',
    // Pinned, because the largest stylesheet in this package is the 2x one.
    stylesheet: 'bundle/style.css',
  },
  {
    library: 'antd-mobile-2x',
    npm: 'antd-mobile',
    prefix: 'adm-',
    tokenPrefix: '--adm-',
    stylesheet: '2x/bundle/style.css',
  },
  { library: 'taro-ui', npm: 'taro-ui', prefix: 'at-' },
  // Desktop kits are drawn in real pixels, so the correct outcome is that
  // nothing is converted at all.
  {
    library: 'element-plus',
    npm: 'element-plus',
    prefix: 'el-',
    tokenPrefix: '--el-',
    canvas: 'unconverted',
  },
  { library: 'antd', npm: 'antd', prefix: 'ant-', canvas: 'unconverted' },
  {
    library: 'arco-design',
    npm: '@arco-design/web-vue',
    prefix: 'arco-',
    canvas: 'unconverted',
  },
  {
    library: 'naive-ui',
    npm: 'naive-ui',
    prefix: 'n-',
    canvas: 'unconverted',
    runtimeStyles: true,
  },
  { library: 'quasar', npm: 'quasar', prefix: 'q-', canvas: 'unconverted' },
  {
    library: 'mui',
    npm: '@mui/material',
    prefix: 'Mui',
    canvas: 'unconverted',
    runtimeStyles: true,
  },
]

const SCRATCH = '.libcheck'

/** `npm` is a batch file on Windows and cannot be spawned without a shell. */
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function download(npmName: string): string {
  const directory = join(SCRATCH, npmName.replace(/[@/]/g, '_'))
  if (existsSync(join(directory, 'package'))) return join(directory, 'package')
  mkdirSync(directory, { recursive: true })
  const output = execFileSync(NPM, ['pack', npmName, '--silent', '--pack-destination', directory], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  const tarball = output.trim().split('\n').at(-1)!
  // bsdtar — which is what `tar` is on Windows — reads `\` as an escape, so a
  // path straight from `join` fails with "Cannot open" on this platform only.
  const slashed = (path: string): string => path.replaceAll('\\', '/')
  execFileSync('tar', ['-xzf', slashed(join(directory, tarball)), '-C', slashed(directory)])
  return join(directory, 'package')
}

/** The largest stylesheet in the package — the one a consumer would import. */
function largestStylesheet(root: string): string | null {
  let best: { path: string; size: number } | null = null
  const walk = (directory: string, depth: number): void => {
    if (depth > 5) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(path, depth + 1)
      } else if (entry.name.endsWith('.css')) {
        const size = statSync(path).size
        if (!best || size > best.size) best = { path, size }
      }
    }
  }
  walk(root, 0)
  return best ? (best as { path: string }).path : null
}

function share(count: number, total: number): string {
  return total ? `${((count / total) * 100).toFixed(0)}%` : '—'
}

const only = process.argv.slice(2)
const rows: string[][] = []
let problems = 0

for (const target of TARGETS) {
  if (only.length && !only.includes(target.library)) continue

  let packaged: string
  try {
    packaged = download(target.npm)
  } catch (error) {
    rows.push([
      target.library,
      `DOWNLOAD FAILED: ${(error as Error).message.split('\n')[0]}`,
      '—',
      '—',
      '—',
      '—',
    ])
    problems += 1
    continue
  }

  const stylesheet = target.stylesheet
    ? join(packaged, target.stylesheet)
    : largestStylesheet(packaged)
  if (!stylesheet) {
    rows.push([
      target.library,
      target.runtimeStyles ? 'runtime styles, none on disk' : 'NO STYLESHEET SHIPPED',
      '—',
      '—',
      '—',
      '—',
      '—',
    ])
    if (!target.runtimeStyles) problems += 1
    continue
  }

  const css = readFileSync(stylesheet, 'utf8')
  const root = postcss.parse(css, { from: stylesheet })

  let rules = 0
  let prefixed = 0
  root.walkRules((rule) => {
    rules += 1
    if (rule.selector.includes(`.${target.prefix}`)) prefixed += 1
  })

  let tokens = 0
  root.walkDecls((declaration) => {
    if (target.tokenPrefix && declaration.prop.startsWith(target.tokenPrefix)) {
      tokens += 1
    }
  })

  // The real path inside node_modules, because file routing reads it. A stand-in
  // like `<pkg>/index.css` would route every package to a single canvas and hide
  // exactly the mistakes worth finding — antd-mobile publishes the same classes
  // for two canvases and tells them apart by directory alone.
  const from = join('node_modules', target.npm, relative(packaged, stylesheet))

  // Automatic mode, not `libraries: [name]`: it is what a user gets by default,
  // and it is where one library shadowing another would show up.
  const resolver = createProfileResolver(resolveOptions({}))
  const routed = resolver.forSelector(resolver.forFile(from), `.${target.prefix}button`, from)
  const canvas = routed.convert ? routed.name : 'unconverted'
  const expected = target.canvas ?? `library:${target.library}`
  const canvasOk = canvas === expected || (!routed.convert && expected === 'unconverted')

  const first = await postcss([adaptiveMatrix({})]).process(css, { from })
  const second = await postcss([adaptiveMatrix({})]).process(first.css, { from })
  const idempotent = first.css === second.css
  const seams = findContinuityIssues(first.root).length
  const warnings = first.warnings().length

  const missing = prefixed === 0 || (target.tokenPrefix ? tokens === 0 : false)
  if (missing || !idempotent || seams > 0 || !canvasOk) problems += 1

  rows.push([
    target.library,
    `${relative(packaged, stylesheet)} ${(css.length / 1024).toFixed(0)}KB`,
    `${prefixed}/${rules} ${share(prefixed, rules)}`,
    target.tokenPrefix ? String(tokens) : '—',
    canvasOk ? canvas : `${canvas} ≠ ${expected}`,
    idempotent ? 'yes' : 'NO',
    `${seams} seams, ${warnings} warns`,
  ])
}

const headers = [
  'library',
  'stylesheet',
  'prefix match',
  'tokens',
  'routes to',
  'idempotent',
  'checks',
]
const widths = headers.map((header, index) =>
  Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
)
const line = (cells: string[]): string =>
  cells.map((cell, index) => cell.padEnd(widths[index]!)).join('  ')

console.log(line(headers))
console.log(widths.map((width) => '-'.repeat(width)).join('  '))
for (const row of rows) console.log(line(row))
console.log(`\n${rows.length} checked, ${problems} needing attention`)
console.log(`scratch downloads left in ${SCRATCH}/ — delete when done`)

if (process.env.CLEAN) rmSync(SCRATCH, { recursive: true, force: true })
