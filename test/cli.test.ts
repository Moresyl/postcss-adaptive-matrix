import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.js'

let directory: string
let out: string
let err: string
let restore: Array<() => void>

/**
 * Captures what the CLI prints.
 *
 * The command writes through `process.stdout.write` rather than `console.log`
 * so that `--css` output can be piped into another tool without a trailing
 * newline being added twice; that is also why the streams are patched here
 * instead of spying on the console.
 */
function capture(): void {
  out = ''
  err = ''
  const stdout = process.stdout.write.bind(process.stdout)
  const stderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk: string) => {
    out += chunk
    return true
  }
  process.stderr.write = (chunk: string) => {
    err += chunk
    return true
  }
  restore.push(() => {
    process.stdout.write = stdout
    process.stderr.write = stderr
  })
}

beforeEach(async () => {
  restore = []
  directory = await mkdtemp(join(tmpdir(), 'adaptive-cli-'))
  capture()
})

afterEach(async () => {
  for (const undo of restore) undo()
  await rm(directory, { recursive: true, force: true })
})

async function file(name: string, contents: string): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, contents, 'utf8')
  return path
}

describe('runCli', () => {
  it('reports each converted declaration with its before and after', async () => {
    const path = await file('app.css', '.page { padding: 16px; border: 1px solid }')

    expect(await runCli([path, '--no-color'])).toBe(0)
    expect(out).toContain('.page')
    expect(out).toContain('16px')
    expect(out).toContain('clamp(')
    expect(out).toContain('1 converted, 1 left as authored')
  })

  it('reports a length that shrinks as the viewport grows', async () => {
    // 16px on the app canvas and 18px on the PC canvas are each plausible on
    // their own, but the app canvas has already reached 17.57px by the time
    // the PC one starts at 16.18px. Confirmed in Chrome at 767px and 768px.
    const path = await file(
      'app.css',
      '.card { font-size: 16px }\n@adaptive pc { .card { font-size: 18px } }',
    )

    expect(await runCli([path, '--no-color'])).toBe(0)
    expect(out).toContain('shrinks')
    expect(out).toContain('.card font-size gets smaller at 768px')
    expect(out).toContain('17.57px')
    expect(out).toContain('16.18px')
  })

  it('says nothing about a length that grows across the breakpoint', async () => {
    const path = await file(
      'app.css',
      '.card { padding: 16px }\n@adaptive pc { .card { padding: 32px } }',
    )

    expect(await runCli([path, '--no-color'])).toBe(0)
    expect(out).not.toContain('shrinks')
  })

  it('hides unchanged declarations unless --all is passed', async () => {
    const path = await file('app.css', '.page { padding: 16px; border: 1px solid }')

    await runCli([path, '--no-color'])
    expect(out).not.toContain('border')

    out = ''
    await runCli([path, '--no-color', '--all'])
    expect(out).toContain('border')
  })

  it('distinguishes a rule from its counterpart inside an at-rule', async () => {
    const path = await file(
      'app.css',
      '.page { padding: 16px } @adaptive pc { .page { padding: 16px } }',
    )

    await runCli([path, '--no-color'])
    // Both blocks select `.page`; without the enclosing context in the label,
    // two different results under one heading read as a bug in the compiler.
    expect(out).toContain('@media (min-width: 768px) › .page')
  })

  it('prints the compiled stylesheet with --css', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--css'])).toBe(0)
    expect(out).toContain('.page')
    expect(out).toContain('clamp(')
    expect(out).not.toContain('converted')
  })

  it('keeps --css output pipeable by sending warnings to stderr', async () => {
    const path = await file('app.css', '@adaptive nope { .page { padding: 16px } }')

    expect(await runCli([path, '--css'])).toBe(0)
    expect(err).toContain('Unknown adaptive profile "nope"')
    expect(out).not.toContain('Unknown adaptive profile')
  })

  it('surfaces compiler warnings rather than swallowing them', async () => {
    const path = await file('app.css', '@adaptive nope { .page { padding: 16px } }')

    await runCli([path, '--no-color'])
    expect(out).toContain('Unknown adaptive profile "nope"')
    // The synthesised library canvases are not names anyone can write.
    expect(out).not.toContain('library:')
  })

  it('lists the authored canvases and summarises the library ones', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    await runCli([path, '--no-color'])
    expect(out).toContain('app (default)')
    expect(out).toContain('library canvases')
    expect(out).not.toContain('library:vant')
  })

  it('honours --profile as an override of defaultProfile', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    await runCli([path, '--no-color', '--profile', 'pc'])
    expect(out).toContain('pc (default)')
  })

  it('reads options from a --config module', async () => {
    const config = join(directory, 'adaptive.config.mjs')
    await writeFile(
      config,
      'export default { defaultProfile: "tv", profiles: { tv:' +
        ' { designWidth: 1920, fluid: { minWidth: 1024, maxWidth: 1920 } } } }',
      'utf8',
    )
    const path = await file('app.css', '.page { padding: 192px }')

    expect(await runCli([path, '--no-color', '-c', config])).toBe(0)
    expect(out).toContain('tv (default)')
    expect(out).toContain('10vw')
  })

  it('reads options from a --config JSON file', async () => {
    // A JSON config is what the published schema is for: an editor that knows
    // the schema completes the option names and flags the out-of-range ones.
    // `$schema` is how it knows, so it has to be accepted and then ignored.
    const config = join(directory, 'adaptive.config.json')
    await writeFile(
      config,
      JSON.stringify({
        $schema: 'https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json',
        defaultProfile: 'tv',
        profiles: { tv: { designWidth: 1920, fluid: { minWidth: 1024, maxWidth: 1920 } } },
      }),
      'utf8',
    )
    const path = await file('app.css', '.page { padding: 192px }')

    expect(await runCli([path, '--no-color', '-c', config])).toBe(0)
    expect(out).toContain('tv (default)')
    expect(out).toContain('10vw')
  })

  it('fails on malformed JSON without a stack trace', async () => {
    const config = join(directory, 'broken.config.json')
    await writeFile(config, '{ "defaultProfile": "app", }', 'utf8')

    expect(await runCli(['-c', config, '--css'])).toBe(1)
    expect(err).toContain('Could not load config')
    // The position the parser stopped at, which is the only useful part of a
    // JSON syntax error. `at ` on its own would match that message, so the
    // check is for a stack frame: indented, on a line of its own.
    expect(err).toContain('position 27')
    expect(/^\s+at /m.test(err)).toBe(false)
  })

  it('fails on a JSON config that is not an object of options', async () => {
    const config = join(directory, 'array.config.json')
    await writeFile(config, '[{ "defaultProfile": "app" }]', 'utf8')

    expect(await runCli(['-c', config, '--css'])).toBe(1)
    expect(err).toContain('must contain a JSON object of options')
  })

  it('routes by path, taking the path from --from when given', async () => {
    // Without `--from` there is nothing to preview file routing against: piped
    // CSS has no path, and a scratch file is never on the route it is meant to
    // exercise. Overriding the path is how a route gets tried before shipping.
    const config = join(directory, 'routes.config.mjs')
    await writeFile(
      config,
      'export default { routes: [{ profile: "pc", file: [/[\\\\/]desktop[\\\\/]/] }] }',
      'utf8',
    )
    const path = await file('app.css', '.a { width: 144px }')

    await runCli([path, '--no-color', '-c', config])
    const app = out

    out = ''
    await runCli([path, '--no-color', '-c', config, '--from', join(directory, 'desktop', 'a.css')])
    expect(out).not.toBe(app)
    // 144 / 1440 on the pc canvas; the app canvas would give 38.4vw.
    expect(out).toContain('10vw')
  })

  it('reads piped CSS, taking its path from --from', async () => {
    // The documented pipe: `cat app.css | adaptive-matrix --from src/app.css`.
    // Without a stdin stand-in nothing exercises it, and a preview command that
    // only works on named files is half a command.
    const stdin = process.stdin
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      // A plain generator: `for await` accepts a synchronous iterable, and the
      // point of the stand-in is that the input arrives in more than one chunk.
      value: (function* pipe() {
        yield Buffer.from('.page { padding: ')
        yield Buffer.from('16px }')
      })(),
    })
    restore.push(() =>
      Object.defineProperty(process, 'stdin', { configurable: true, value: stdin }),
    )

    expect(await runCli(['--no-color', '--from', '/project/src/app.css'])).toBe(0)
    expect(out).toContain('.page')
    expect(out).toContain('clamp(')
    expect(out).toContain('1 converted')
  })

  it('marks a declaration the compiler added rather than changed', async () => {
    const config = join(directory, 'preserve.config.mjs')
    await writeFile(config, 'export default { preserveOriginal: true }', 'utf8')
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--no-color', '--all', '-c', config])).toBe(0)
    // The fallback keeps the authored `16px` and the compiled value is the
    // addition, so the diff has to show one of the two as new rather than
    // pairing them up as a change.
    expect(out).toContain('+ ')
  })

  it('totals across multiple files', async () => {
    const one = await file('a.css', '.a { width: 100px }')
    const two = await file('b.css', '.b { width: 200px }')

    expect(await runCli([one, two, '--no-color'])).toBe(0)
    expect(out).toContain('2 declarations converted across 2 files')
  })

  it('prints help without doing any work', async () => {
    expect(await runCli(['--help'])).toBe(0)
    expect(out).toContain('adaptive-matrix')
    expect(err).toBe('')
  })

  it('fails with usage on an unknown option', async () => {
    expect(await runCli(['--nope'])).toBe(1)
    expect(err).toContain('Unknown option --nope')
    expect(err).toContain('Options')
  })

  it('fails when an option is missing its value', async () => {
    expect(await runCli(['--profile'])).toBe(1)
    expect(err).toContain('--profile needs a value')
  })

  it('fails on an unreadable file without a stack trace', async () => {
    expect(await runCli([join(directory, 'missing.css'), '--no-color'])).toBe(1)
    expect(err).toContain('missing.css')
    expect(err).not.toContain('at ')
  })

  it('fails on a config that cannot be loaded at all', async () => {
    expect(await runCli(['-c', join(directory, 'absent.config.mjs'), '--css'])).toBe(1)
    expect(err).toContain('Could not load config')
    expect(err).toContain('absent.config.mjs')
  })

  it('fails on a config that does not export an object', async () => {
    const config = join(directory, 'bad.config.mjs')
    await writeFile(config, 'export default 42', 'utf8')

    expect(await runCli(['-c', config, '--css'])).toBe(1)
    expect(err).toContain('must default-export an options object')
  })

  it('fails on a config that forgot the default keyword', async () => {
    // The failure this guards is silence: a module namespace object is still an
    // object, so falling back to it once passed every check and ran with the
    // built-in defaults. The header listed canvases, the diff looked right, and
    // nothing said the file had not been read.
    const config = join(directory, 'named.config.mjs')
    await writeFile(config, 'export const options = { defaultProfile: "app" }', 'utf8')
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '-c', config, '--no-color'])).toBe(1)
    expect(err).toContain('must default-export an options object')
    expect(err).toContain('"options"')
    expect(out).toBe('')
  })

  it('fails on a preset that was exported without being called', async () => {
    const config = join(directory, 'uncalled.config.mjs')
    await writeFile(config, 'export default function preset() { return {} }', 'utf8')
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '-c', config, '--no-color'])).toBe(1)
    expect(err).toContain('default-exports a function')
  })

  it('reports an invalid config before reading any stylesheet', async () => {
    const config = join(directory, 'invalid.config.mjs')
    await writeFile(
      config,
      'export default { defaultProfile: "ghost", profiles: { app: { designWidth: 375 } } }',
      'utf8',
    )
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '-c', config, '--no-color'])).toBe(1)
    expect(err).toContain('defaultProfile "ghost" does not exist')
    expect(out).toBe('')
  })

  it('emits colour only when asked, so a piped diff stays plain', async () => {
    const ESC = String.fromCharCode(27)
    const path = await file('app.css', '.page { padding: 16px }')

    await runCli([path, '--no-color'])
    expect(out.includes(ESC)).toBe(false)

    out = ''
    await runCli([path, '--color'])
    expect(out.includes(ESC)).toBe(true)
  })
})

describe('runCli --targets', () => {
  it('names the feature, the browser, what breaks and the switch to flip', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--no-color', '--targets', 'ios_saf 13'])).toBe(0)
    expect(out).toContain('needs clamp(), min(), max()')
    // Short by a point release — clamp() landed in iOS 13.4.
    expect(out).toContain('iOS Safari 13 < 13.4-13.7')
    expect(out).toContain("instead: strategy: 'viewport'")
  })

  it('says so plainly when every target is covered', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    await runCli([path, '--no-color', '--targets', 'ios_saf 17, chrome 120'])
    expect(out).toContain('every target reads all')
    expect(out).not.toContain('needs ')
  })

  it('audits nothing without the flag', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    await runCli([path, '--no-color'])
    expect(out).not.toContain('needs ')
    expect(out).not.toContain('every target reads')
  })

  it('refuses a target it has no data for instead of passing it', async () => {
    // Accepting the run and printing a clean report would answer a question
    // about Netscape that was never actually asked of anything.
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--targets', 'netscape 4'])).toBe(1)
    expect(err).toContain('No support data for "netscape"')
  })

  it('ignores the empty entry a trailing comma leaves behind', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--no-color', '--targets', 'ios_saf 17, chrome 120,'])).toBe(0)
    expect(out).toContain('every target reads all')
  })

  it('refuses a target list that names nothing at all', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--targets', ' , '])).toBe(1)
    expect(err).toContain('needs at least one browser and version')
  })

  it('refuses a target with no version', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--targets', 'safari'])).toBe(1)
    expect(err).toContain('Could not read target "safari"')
  })
})
