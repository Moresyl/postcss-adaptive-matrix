// The shebang is added by the build (see tsup.config.ts). Keeping it out of the
// source avoids emitting it twice, and this file is run through `tsx` in
// development, which does not need one.
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss, {
  type AtRule,
  type Container,
  type Declaration,
  type Document,
  type Root,
  type Rule,
} from 'postcss'
import { LIBRARY_PROFILE_PREFIX } from './core/libraries.js'
import { resolveOptions } from './core/options.js'
import type { AdaptiveMatrixOptions } from './core/types.js'
import { adaptiveMatrix } from './postcss/plugin.js'

const HELP = `
adaptive-matrix — preview what postcss-adaptive-matrix does to a stylesheet

  adaptive-matrix <file...> [options]
  cat app.css | adaptive-matrix --from src/app.css

Options
  -c, --config <path>  module default-exporting the plugin options
      --from <path>    treat the input as if it lived here; file-based routes,
                       include/exclude and library paths all key off this
      --profile <name> override defaultProfile
      --all            list unchanged declarations too
      --css            print the compiled stylesheet instead of a diff
      --color          force colour; --no-color forces plain. Without either,
                       colour follows the terminal and honours NO_COLOR
  -h, --help

Without --config the built-in defaults are used, and the header says which
profiles those are. A .ts config needs a loader:
  npx tsx node_modules/postcss-adaptive-matrix/dist/cli.js app.css -c cfg.ts
`.trimStart()

interface CliArgs {
  files: string[]
  config?: string
  from?: string
  profile?: string
  all: boolean
  css: boolean
  color: boolean
  help: boolean
}

/** One declaration the compiler touched, or deliberately did not. */
interface Change {
  context: string
  prop: string
  before: string | null
  after: string
}

class CliError extends Error {}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    all: false,
    css: false,
    color: process.stdout.isTTY === true && !process.env['NO_COLOR'],
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    const value = (): string => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('-')) {
        throw new CliError(`${arg} needs a value.`)
      }
      index += 1
      return next
    }

    switch (arg) {
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
      case '--all':
        args.all = true
        break
      case '--css':
        args.css = true
        break
      case '--color':
        args.color = true
        break
      case '--no-color':
        args.color = false
        break
      default:
        if (arg.startsWith('-') && arg !== '-') {
          throw new CliError(`Unknown option ${arg}.`)
        }
        args.files.push(arg)
    }
  }
  return args
}

async function loadConfig(path: string): Promise<AdaptiveMatrixOptions> {
  const absolute = resolve(path)
  let loaded: unknown
  try {
    loaded = await import(pathToFileURL(absolute).href)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new CliError(`Could not load config ${path}: ${detail}`)
  }
  const module = loaded as { default?: unknown }
  const options = module.default ?? loaded
  if (!options || typeof options !== 'object') {
    throw new CliError(`Config ${path} must default-export an options object.`)
  }
  return options as AdaptiveMatrixOptions
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
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
): Promise<{ root: Root; changes: Change[]; warnings: string[] }> {
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

function report(
  label: string,
  changes: Change[],
  warnings: string[],
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

  const unchanged = changes.length - converted.length
  lines.push(
    c.dim(`  ${converted.length} converted, ${unchanged} left as authored`),
    '',
  )
  return { converted: converted.length, lines }
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${HELP}`)
    return 1
  }

  if (args.help) {
    process.stdout.write(HELP)
    return 0
  }

  try {
    const options = args.config ? await loadConfig(args.config) : {}
    if (args.profile) options.defaultProfile = args.profile

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
      args.files.length && args.files[0] !== '-'
        ? await Promise.all(
            args.files.map(async (file) => ({
              from: resolve(file),
              label: relative(process.cwd(), resolve(file)) || file,
              source: await readFile(resolve(file), 'utf8'),
            })),
          )
        : [
            {
              from: resolve(args.from ?? 'stdin.css'),
              label: args.from ?? '<stdin>',
              source: await readStdin(),
            },
          ]

    let total = 0
    for (const input of inputs) {
      const from = args.from ? resolve(args.from) : input.from
      const { root, changes, warnings } = await compile(input.source, from, options)

      if (args.css) {
        // Warnings go to stderr so that `--css > out.css` still shows them and
        // the redirected file stays valid CSS.
        for (const warning of warnings) {
          process.stderr.write(`${input.label}: ${warning}\n`)
        }
        process.stdout.write(`${root.toString()}\n`)
        continue
      }
      const { converted, lines } = report(input.label, changes, warnings, args, profiles)
      total += converted
      process.stdout.write(`${lines.join('\n')}\n`)
    }

    if (!args.css && inputs.length > 1) {
      process.stdout.write(`${total} declarations converted across ${inputs.length} files\n`)
    }
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    return 1
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  // `.then` rather than top-level `await`: this file is also imported by the
  // test suite, where a module-level await would stall the import graph.
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
