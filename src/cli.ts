// The shebang is added by the build (see tsup.config.ts). Keeping it out of the
// source avoids emitting it twice, and this file is run through `tsx` in
// development, which does not need one.
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { pathToFileURL } from 'node:url'
import postcss, {
  type AtRule,
  type Container,
  type Declaration,
  type Document,
  type Root,
  type Rule,
} from 'postcss'
import {
  type CompatAudit,
  auditCompatibility,
  compareVersions,
  isBrowserVersion,
  resolveBrowser,
} from './core/compat.js'
import { type ContinuityIssue, findContinuityIssues } from './core/continuity.js'
import { resolveRootValue } from './core/convert.js'
import { LIBRARY_PROFILE_PREFIX } from './core/libraries.js'
import { resolveOptions } from './core/options.js'
import {
  CLI_REPORT_FORMAT_VERSION,
  type CliCompatibilityReport,
  type CliDeclarationChange,
  type CliErrorReport,
  type CliFileReport,
  type CliQualityGateCategory,
  type CliSuccessReport,
} from './core/report.js'
import type { AdaptiveMatrixOptions } from './core/types.js'
import { adaptiveMatrix } from './postcss/plugin.js'

const HELP = `
adaptive-matrix — preview what postcss-adaptive-matrix does to a stylesheet

  adaptive-matrix <file...> [options]
  adaptive-matrix [options] -- <file...>
  adaptive-matrix - [options]
  cat app.css | adaptive-matrix --from src/app.css

Options
  -c, --config <path>  module default-exporting the plugin options, or a .json
                       file of options (add "$schema" for editor completion)
      --from <path>    treat the input as if it lived here; file-based routes,
                       include/exclude and library paths all key off this
      --profile <name> override defaultProfile
      --targets <list> audit the output against the oldest browsers you
                       support, e.g. "safari 14, ios_saf 13, chrome 90"
      --fail-on <list> exit 1 on warnings, continuity regressions or
                       compatibility findings; comma-separate or use "any"
      --all            list unchanged declarations too
      --css            print the compiled stylesheet instead of a diff
      --json           print one versioned JSON report for automation; errors
                       are JSON too and still use a non-zero exit code
      --color          force colour; --no-color forces plain. Without either,
                       colour follows the terminal and honours NO_COLOR
      --               treat every remaining argument as a file path
  -h, --help

Long options that take a value also accept --option=value.

Without --config the built-in defaults are used, and the header says which
profiles those are.

Use exactly one '-' to name stdin explicitly. Stdin cannot be mixed with file
paths, and --from applies to only one input because it names that input's path.

The diff is followed by any "shrinks" findings: sampled length decreases across
resolvable viewport breakpoints. These may already exist in the authored CSS;
they are diagnostics to investigate, not proof of a compiler regression.
Unresolvable values are skipped; a clean report does not certify the layout.

With --targets it also reports "needs": a CSS feature in the output that one of
those browsers cannot read, what that browser discards as a result, and the
option that stops the feature being emitted. Known names are chrome, edge,
safari, firefox, ios_saf and samsung; android and webview resolve to chrome.

A .ts config needs a loader:
  npx tsx node_modules/postcss-adaptive-matrix/dist/cli.js app.css -c cfg.ts
`.trimStart()

interface CliArgs {
  files: string[]
  config?: string
  from?: string
  profile?: string
  targets?: Record<string, string>
  failOn: CliQualityGateCategory[]
  all: boolean
  css: boolean
  json: boolean
  color: boolean
  help: boolean
}

/** One declaration the compiler touched, or deliberately did not. */
type Change = CliDeclarationChange

class CliError extends Error {}

const QUALITY_GATE_CATEGORIES = [
  'warnings',
  'continuity',
  'compatibility',
] as const satisfies readonly CliQualityGateCategory[]

function parseQualityGate(input: string): CliQualityGateCategory[] {
  const selected = new Set<CliQualityGateCategory>()
  for (const entry of input.split(',')) {
    const category = entry.trim().toLowerCase()
    if (!category) continue
    if (category === 'any') {
      for (const known of QUALITY_GATE_CATEGORIES) selected.add(known)
      continue
    }
    if (!QUALITY_GATE_CATEGORIES.includes(category as CliQualityGateCategory)) {
      throw new CliError(
        `Unknown --fail-on category "${entry.trim()}". Use warnings, continuity, compatibility or any.`,
      )
    }
    selected.add(category as CliQualityGateCategory)
  }
  if (!selected.size) {
    throw new CliError('--fail-on needs warnings, continuity, compatibility or any.')
  }
  return [...selected]
}

/**
 * Reads `"safari 14, ios_saf 13"` into a target map.
 *
 * Deliberately not a browserslist query. A query like `> 0.5%` answers a
 * question about your users, needs the browserslist package and its usage
 * database to resolve, and changes meaning as the database updates — none of
 * which belongs inside a preview command. Name the versions you mean.
 */
function parseTargets(input: string): Record<string, string> {
  const targets: Record<string, string> = {}
  for (const entry of input.split(',')) {
    const text = entry.trim()
    if (!text) continue
    const match = /^([a-z_\s-]+?)(?:\s*>=\s*|\s*@\s*|\s+)(\S+)$/i.exec(text)
    if (!match) {
      throw new CliError(
        `Could not read target "${text}". Write a browser and a version, ` +
          `such as "safari 14"; separate several with commas.`,
      )
    }
    const [, name, version] = match as unknown as [string, string, string]
    if (!isBrowserVersion(version)) {
      throw new CliError(
        `Could not read target version "${version}" in "${text}". Use dotted numbers such as "14" or "13.4".`,
      )
    }
    const browser = resolveBrowser(name)
    if (!browser) {
      throw new CliError(
        `No support data for "${name.trim()}". Known targets: chrome, edge, ` +
          `safari, firefox, ios_saf, samsung (android and webview mean chrome).`,
      )
    }
    const existing = targets[browser]
    // Aliases such as `android` and `chrome` intentionally share support data.
    // Keeping the oldest duplicate makes the audit conservative and invariant
    // to argument order instead of silently letting the last spelling win.
    if (existing === undefined || compareVersions(version, existing) < 0) {
      targets[browser] = version
    }
  }
  if (!Object.keys(targets).length) {
    throw new CliError('--targets needs at least one browser and version.')
  }
  return targets
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    failOn: [],
    all: false,
    css: false,
    json: false,
    color: process.stdout.isTTY === true && !process.env['NO_COLOR'],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    const inline = /^(--(?:config|from|profile|targets|fail-on))=(.*)$/s.exec(arg)
    const option = inline?.[1] ?? arg
    const value = (): string => {
      if (inline) {
        if (!inline[2]) throw new CliError(`${option} needs a value.`)
        return inline[2]
      }
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('-')) {
        throw new CliError(`${option} needs a value.`)
      }
      index += 1
      return next
    }

    switch (option) {
      case '--':
        args.files.push(...argv.slice(index + 1))
        index = argv.length
        break
      case '-h':
      case '--help':
        args.help = true
        break
      case '-c':
      case '--config':
        args.config = value()
        break
      case '--from':
        args.from = value()
        break
      case '--profile':
        args.profile = value()
        break
      case '--targets':
        args.targets = parseTargets(value())
        break
      case '--fail-on':
        args.failOn = [...new Set([...args.failOn, ...parseQualityGate(value())])]
        break
      case '--all':
        args.all = true
        break
      case '--css':
        args.css = true
        break
      case '--json':
        args.json = true
        break
      case '--color':
        args.color = true
        break
      case '--no-color':
        args.color = false
        break
      default:
        if (option.startsWith('-') && option !== '-') {
          throw new CliError(`Unknown option ${option}.`)
        }
        args.files.push(option)
    }
  }
  return args
}

/**
 * A `.json` config, read as a file rather than imported.
 *
 * `import … with { type: 'json' }` would be the tidier spelling, but import
 * attributes are a syntax error on Node 18, which this package still supports —
 * and a syntax error in the CLI entry point fails before the version check
 * could explain itself. Reading and parsing costs one line and works
 * everywhere.
 *
 * `$schema` is dropped on the way through. It is how an editor knows to offer
 * completion and range checking on the file, so a reader is encouraged to write
 * it; it is not an option, and passing it on would leave a stray key in the
 * resolved configuration.
 */
async function loadJsonConfig(path: string, absolute: string): Promise<AdaptiveMatrixOptions> {
  let parsed: unknown
  try {
    const source = await readFile(absolute, 'utf8')
    // U+FEFF is a common UTF-8 BOM in files written by Windows editors. JSON
    // itself does not admit it, but treating an encoding marker as user data
    // makes an otherwise valid cross-platform config fail before validation.
    parsed = JSON.parse(source.startsWith('\uFEFF') ? source.slice(1) : source)
  } catch (cause) {
    // JSON.parse may quote configuration contents in its diagnostic.
    const detail =
      cause instanceof SyntaxError
        ? `Invalid JSON syntax${cause.message.match(/ at position \d+(?: \(line \d+ column \d+\))?$/)?.[0] ?? ''}.`
        : cause instanceof Error
          ? cause.message
          : String(cause)
    throw new CliError(`Could not load config ${path}: ${detail}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError(`Config ${path} must contain a JSON object of options.`)
  }
  const { $schema: _schema, ...options } = parsed as Record<string, unknown>
  return options
}

async function loadConfig(path: string): Promise<AdaptiveMatrixOptions> {
  const absolute = resolve(path)
  if (absolute.toLowerCase().endsWith('.json')) return loadJsonConfig(path, absolute)
  let loaded: unknown
  try {
    loaded = await import(pathToFileURL(absolute).href)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new CliError(`Could not load config ${path}: ${detail}`)
  }
  // Deliberately no `?? loaded` fallback. A module namespace object is still an
  // object, so falling back to it would pass every check below and then spread
  // into the defaults as a bag of unknown keys — the run would succeed, the
  // header would list the built-in canvases, and nothing would say the config
  // was never read. Someone who passed `-c` asked for their file to be used.
  const module = loaded as { default?: unknown }
  const options = module.default
  if (typeof options === 'function') {
    // `export default appPcPreset` instead of `appPcPreset({ ... })` — the
    // preset helpers are functions, and forgetting to call one is easy.
    throw new CliError(
      `Config ${path} default-exports a function. Call it and export the result: ` +
        'export default appPcPreset({ ... }).',
    )
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    const named = Object.keys(loaded as object).filter((key) => key !== 'default')
    throw new CliError(
      `Config ${path} must default-export an options object` +
        (named.length
          ? `. It exports ${named.map((key) => `"${key}"`).join(', ')} but no default.`
          : '.'),
    )
  }
  return options
}

async function readStdin(): Promise<string> {
  let output = ''
  let decoder = new StringDecoder('utf8')
  for await (const chunk of process.stdin) {
    // Node streams yield Buffers by default, but a host may have called
    // setEncoding('utf8') before invoking the exported runCli(). Supporting
    // both avoids making the otherwise optional stdin path depend on stream
    // ownership details.
    if (typeof chunk === 'string') {
      output += decoder.end() + chunk
      decoder = new StringDecoder('utf8')
    } else {
      output += decoder.write(Buffer.from(chunk as Uint8Array))
    }
  }
  return output + decoder.end()
}

/**
 * Where a declaration sits, read from the outside in: `@media … › .page`.
 *
 * The selector alone is ambiguous — `@adaptive pc { .page {} }` compiles to a
 * second `.page` block under a media query, and a diff listing `.page` twice
 * with different numbers reads like a bug rather than the intended output.
 */
function contextOf(declaration: Declaration): string {
  const path: string[] = []
  let node: Container | Document | undefined = declaration.parent
  while (node && node.type !== 'root') {
    if (node.type === 'rule') path.unshift((node as Rule).selector)
    else if (node.type === 'atrule') {
      const at = node as AtRule
      path.unshift(`@${at.name}${at.params ? ` ${at.params}` : ''}`)
    }
    node = node.parent
  }
  return path.join(' › ')
}

/**
 * Collects per-declaration changes.
 *
 * The stylesheet is parsed here rather than handed to `process` as a string,
 * so the original values can be recorded against the very nodes the plugin
 * mutates. A declaration missing from that record was added by the compiler —
 * the root foundation, or a `preserveOriginal` fallback.
 */
async function compile(
  source: string,
  from: string,
  options: AdaptiveMatrixOptions,
  rootValue: number,
  targets?: Record<string, string>,
): Promise<{
  root: Root
  changes: Change[]
  warnings: string[]
  issues: ContinuityIssue[]
  audit: CompatAudit | null
}> {
  const root = postcss.parse(source, { from })
  const original = new Map<Declaration, string>()
  root.walkDecls((declaration) => {
    original.set(declaration, declaration.value)
  })

  const result = await postcss([adaptiveMatrix(options)]).process(root, { from })

  const changes: Change[] = []
  result.root.walkDecls((declaration) => {
    changes.push({
      context: contextOf(declaration),
      prop: declaration.prop,
      before: original.get(declaration) ?? null,
      after: declaration.value,
    })
  })

  return {
    root: result.root,
    changes,
    warnings: result.warnings().map((warning) => warning.text),
    // Run on the compiled tree, not the source: the question is whether the
    // *output* is monotonic, and the numbers to compare only exist once the
    // canvases have been applied.
    // The seam check compares `rem` against `px`, so it has to measure them
    // with the same ruler the compiler wrote them with.
    issues: findContinuityIssues(result.root, rootValue),
    // Audited from the compiled text rather than from the options, so that a
    // feature arriving through a preset, a library route or the authored CSS
    // itself is caught the same as one this compiler chose to emit. The
    // stylesheet is what ships; it is the only honest thing to read.
    audit: targets ? auditCompatibility(result.root.toString(), targets) : null,
  }
}

function paint(color: boolean) {
  const wrap = (code: string) => (text: string) =>
    color ? `\u001B[${code}m${text}\u001B[0m` : text
  return {
    dim: wrap('2'),
    bold: wrap('1'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    cyan: wrap('36'),
  }
}

/**
 * Renders the browser-support findings.
 *
 * Says what breaks before saying what to do about it: "Safari 14 is too old"
 * is not actionable on its own, and the interesting part of a CSS support gap
 * is always how much of the stylesheet goes with it.
 */
function auditLines(audit: CompatAudit, c: ReturnType<typeof paint>): string[] {
  const lines: string[] = []
  for (const name of audit.unknownBrowsers) {
    lines.push(`  ${c.yellow('warning')} no support data for target "${name}" — it was not checked`)
  }
  for (const { feature, sample, shortfalls } of audit.findings) {
    const who = shortfalls
      .map(({ name, target, since }) =>
        since === null ? `${name} (never)` : `${name} ${target} < ${since}`,
      )
      .join(', ')
    lines.push(`  ${c.yellow('needs')} ${c.bold(feature.title)} ${c.dim('—')} ${who}`)
    lines.push(c.dim(`          from: ${feature.emittedBy}`))
    lines.push(c.dim(`          seen: ${sample}`))
    lines.push(c.dim(`          if unsupported: ${feature.failure}`))
    lines.push(c.dim(`          instead: ${feature.fallback}`))
  }
  if (!audit.findings.length && !audit.unknownBrowsers.length) {
    const covered = audit.satisfied.length
    lines.push(c.dim(`  every target reads all ${covered} CSS features in this output`))
  }
  return lines
}

function continuityLines(issues: ContinuityIssue[], c: ReturnType<typeof paint>): string[] {
  const lines: string[] = []
  const round = (value: number) => `${Math.round(value * 100) / 100}px`
  for (const issue of issues) {
    // A negative length is drawn bigger by moving away from zero, so "smaller"
    // would describe the wrong direction for an overhang or a pulled-in gutter.
    const negative = issue.below.px < 0
    lines.push(
      `  ${c.yellow('shrinks')} ${c.cyan(issue.selector)} ${issue.prop} ` +
        `${negative ? 'falls back toward zero' : 'gets smaller'} at ${issue.breakpoint}px: ` +
        `${round(issue.below.px)} ${c.dim('→')} ${round(issue.above.px)}`,
    )
    lines.push(
      c.dim(
        `          ${issue.below.value} → ${issue.above.value}. ` +
          `Widening the window makes this ${negative ? 'shallower' : 'smaller'}` +
          ' — the two canvases disagree here.',
      ),
    )
  }
  return lines
}

function report(
  label: string,
  changes: Change[],
  warnings: string[],
  issues: ContinuityIssue[],
  audit: CompatAudit | null,
  args: CliArgs,
  profiles: string[],
): { converted: number; lines: string[] } {
  const c = paint(args.color)
  const lines: string[] = [c.bold(label)]
  lines.push(c.dim(`  profiles: ${profiles.join(', ')}`))

  const converted = changes.filter((change) => change.before !== change.after)
  const shown = args.all ? changes : converted
  const width = Math.max(0, ...shown.map((change) => change.prop.length))

  let context: string | null = null
  for (const change of shown) {
    if (change.context !== context) {
      context = change.context
      lines.push(`  ${c.cyan(context || '(generated)')}`)
    }
    const prop = change.prop.padEnd(width)
    if (change.before === null) {
      lines.push(`    ${prop}  ${c.green('+')} ${change.after}`)
    } else if (change.before === change.after) {
      lines.push(c.dim(`    ${prop}    ${change.after}`))
    } else {
      lines.push(`    ${prop}  ${c.red(change.before)} ${c.dim('→')} ${c.green(change.after)}`)
    }
  }

  for (const warning of warnings) lines.push(`  ${c.yellow('warning')} ${warning}`)

  // Printed after the diff rather than beside the declaration, because the
  // finding belongs to neither of the two declarations that produced it — it
  // is about the step between them.
  lines.push(...continuityLines(issues, c))

  if (audit) lines.push(...auditLines(audit, c))

  const unchanged = changes.length - converted.length
  lines.push(c.dim(`  ${converted.length} converted, ${unchanged} left as authored`), '')
  return { converted: converted.length, lines }
}

function jsonCompatibility(audit: CompatAudit | null): CliCompatibilityReport | null {
  if (!audit) return null
  return {
    findings: audit.findings.map(({ feature, sample, shortfalls }) => ({
      id: feature.id,
      title: feature.title,
      sample,
      emittedBy: feature.emittedBy,
      failure: feature.failure,
      fallback: feature.fallback,
      shortfalls,
    })),
    satisfied: audit.satisfied,
    unknownBrowsers: audit.unknownBrowsers,
  }
}

async function writeJson(value: unknown): Promise<void> {
  await writeReportChunk(`${JSON.stringify(value, null, 2)}\n`)
}

async function writeReportChunk(chunk: string): Promise<void> {
  const stream = process.stdout
  if (stream.write(chunk)) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('drain', drained)
      stream.removeListener('error', failed)
      stream.removeListener('close', closed)
    }
    const drained = () => {
      cleanup()
      resolve()
    }
    const failed = (error: Error) => {
      cleanup()
      reject(error)
    }
    const closed = () => failed(new CliError('Output stream closed before draining.'))
    stream.once('drain', drained)
    stream.once('error', failed)
    stream.once('close', closed)
    if (stream.destroyed || stream.writableEnded) closed()
  })
}

async function writeCliError(error: unknown, json: boolean): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  if (json) {
    try {
      await writeJson({
        formatVersion: CLI_REPORT_FORMAT_VERSION,
        ok: false,
        error: { message },
      } satisfies CliErrorReport)
    } catch (outputError) {
      process.stderr.write(
        `${outputError instanceof Error ? outputError.message : String(outputError)}\n`,
      )
    }
  } else {
    process.stderr.write(`${message}\n`)
  }
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    const terminator = argv.indexOf('--')
    const optionArgs = terminator === -1 ? argv : argv.slice(0, terminator)
    if (optionArgs.includes('--json')) await writeCliError(error, true)
    else process.stderr.write(`${(error as Error).message}\n\n${HELP}`)
    return 1
  }

  let writingOutput = false
  try {
    if (args.help) {
      writingOutput = true
      await writeReportChunk(HELP)
      return 0
    }
    if (args.json && args.css) {
      throw new CliError('--json and --css are different output formats; choose one.')
    }
    const stdinInputs = args.files.filter((file) => file === '-').length
    if (stdinInputs && args.files.length > 1) {
      throw new CliError('Stdin (-) cannot be mixed with file paths; run them separately.')
    }
    if (args.from && args.files.length > 1) {
      throw new CliError(
        '--from names one logical source path and cannot be shared by multiple input files.',
      )
    }
    if (args.failOn.includes('compatibility') && !args.targets) {
      throw new CliError('--fail-on compatibility requires --targets to define browser support.')
    }
    const loadedOptions = args.config ? await loadConfig(args.config) : {}
    if (Object.hasOwn(loadedOptions, 'plugins')) {
      throw new CliError(
        `Config ${args.config} contains a PostCSS "plugins" wrapper. ` +
          'The CLI expects adaptive-matrix options directly; move the shared options ' +
          'to adaptive.config.mjs and pass that file with --config.',
      )
    }
    // Config modules are cached by ESM and may deliberately freeze their
    // exported object. A command-line override belongs to this invocation;
    // mutating the export either throws or leaks into the next runCli() call.
    const options = args.profile
      ? { ...loadedOptions, defaultProfile: args.profile }
      : loadedOptions

    // Resolved before anything is read: a bad defaultProfile or an inverted
    // fluid window fails here, with the compiler's own message, rather than
    // after stdin has been drained or a screen of output already printed.
    const resolved = resolveOptions(options)

    // `library:*` canvases are synthesised from the registry, one per adapted
    // component library. Listing all eleven would bury the two or three
    // canvases the author actually wrote, so they are summarised as a count.
    const authored: string[] = []
    let libraries = 0
    for (const name of Object.keys(resolved.profiles)) {
      if (name.startsWith(LIBRARY_PROFILE_PREFIX)) libraries += 1
      else authored.push(name === resolved.defaultProfile ? `${name} (default)` : name)
    }
    const profiles = libraries ? [...authored, `+${libraries} library canvases`] : authored

    const inputs =
      args.files.length && !stdinInputs
        ? args.files.map((file) => {
            const absolute = resolve(file)
            return {
              from: absolute,
              label: relative(process.cwd(), absolute) || file,
              source: undefined,
            }
          })
        : [
            {
              from: resolve(args.from ?? 'stdin.css'),
              label: args.from ?? '<stdin>',
              source: await readStdin(),
            },
          ]

    let total = 0
    let totalWarnings = 0
    let totalContinuity = 0
    let totalCompatibility = 0
    const jsonFiles: CliFileReport[] = []
    for (const input of inputs) {
      const from = args.from ? resolve(args.from) : input.from
      // Read only the file being compiled. Large batches retain reports, not a
      // second in-memory copy of every source file at once.
      const source = input.source ?? (await readFile(input.from, 'utf8'))
      // Resolve a functional ruler exactly once for this file. Passing the
      // scalar into the plugin also guarantees conversion and the continuity
      // gate measure rem values with the identical number.
      const rootValue = resolveRootValue(resolved, from)
      const { root, changes, warnings, issues, audit } = await compile(
        source,
        from,
        { ...options, rootValue },
        rootValue,
        args.targets,
      )
      totalWarnings += warnings.length
      totalContinuity += issues.length
      totalCompatibility += audit?.findings.length ?? 0

      if (args.css) {
        // Human diagnostics go to stderr so that `--css > out.css` stays valid
        // CSS without suppressing the evidence that explains a quality-gate
        // failure. This includes every category, not only compiler warnings.
        const c = paint(args.color)
        const diagnostics = warnings.map((warning) => `  ${c.yellow('warning')} ${warning}`)
        diagnostics.push(...continuityLines(issues, c))
        if (audit) diagnostics.push(...auditLines(audit, c))
        if (diagnostics.length) {
          process.stderr.write(`${c.bold(input.label)}\n${diagnostics.join('\n')}\n`)
        }
        await writeReportChunk(`${root.toString()}\n`)
        continue
      }
      if (args.json) {
        const converted = changes.filter((change) => change.before !== change.after)
        total += converted.length
        jsonFiles.push({
          file: input.label,
          converted: converted.length,
          unchanged: changes.length - converted.length,
          changes: args.all ? changes : converted,
          warnings,
          continuity: issues,
          compatibility: jsonCompatibility(audit),
        })
        continue
      }
      const { converted, lines } = report(
        input.label,
        changes,
        warnings,
        issues,
        audit,
        args,
        profiles,
      )
      total += converted
      await writeReportChunk(`${lines.join('\n')}\n`)
    }

    const gateCounts: Record<CliQualityGateCategory, number> = {
      warnings: totalWarnings,
      continuity: totalContinuity,
      compatibility: totalCompatibility,
    }
    const gate = args.failOn.length
      ? {
          failOn: args.failOn,
          passed: args.failOn.every((category) => gateCounts[category] === 0),
        }
      : null

    if (args.json) {
      writingOutput = true
      await writeJson({
        formatVersion: CLI_REPORT_FORMAT_VERSION,
        ok: true,
        profiles: {
          default: resolved.defaultProfile,
          authored: Object.keys(resolved.profiles).filter(
            (name) => !name.startsWith(LIBRARY_PROFILE_PREFIX),
          ),
          libraries,
        },
        targets: args.targets ?? null,
        summary: {
          files: jsonFiles.length,
          declarations: jsonFiles.reduce((sum, file) => sum + file.converted + file.unchanged, 0),
          converted: total,
          unchanged: jsonFiles.reduce((sum, file) => sum + file.unchanged, 0),
          warnings: jsonFiles.reduce((sum, file) => sum + file.warnings.length, 0),
          continuityIssues: jsonFiles.reduce((sum, file) => sum + file.continuity.length, 0),
          compatibilityFindings: jsonFiles.reduce(
            (sum, file) => sum + (file.compatibility?.findings.length ?? 0),
            0,
          ),
        },
        gate,
        files: jsonFiles,
      } satisfies CliSuccessReport)
      writingOutput = false
    } else if (!args.css && inputs.length > 1) {
      await writeReportChunk(`${total} declarations converted across ${inputs.length} files\n`)
    }
    if (gate && !gate.passed) {
      const failed = gate.failOn
        .filter((category) => gateCounts[category] > 0)
        .map((category) => `${category}=${gateCounts[category]}`)
        .join(', ')
      if (!args.json) process.stderr.write(`Quality gate failed: ${failed}.\n`)
      return 1
    }
    return 0
  } catch (error) {
    await writeCliError(error, args.json && !writingOutput)
    return 1
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  // `.then` rather than top-level `await`: this file is also imported by the
  // test suite, where a module-level await would stall the import graph.
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
