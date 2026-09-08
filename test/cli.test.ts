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
  it.each(['parse', 'config'])(
    'handles a broken pipe while reporting a %s error as JSON',
    async (phase) => {
      const args =
        phase === 'parse'
          ? ['--unknown-option', '--json']
          : ['--config', await file('broken.json', '{invalid'), '--json']
      const captureWrite = process.stdout.write
      const counts = ['drain', 'close', 'error'].map((name) => process.stdout.listenerCount(name))
      let signal: () => void = () => {}
      const written = new Promise<void>((resolve) => {
        signal = resolve
      })
      let writes = 0
      process.stdout.write = (chunk: string) => {
        captureWrite(chunk)
        writes++
        signal()
        return false
      }
      restore.push(() => {
        process.stdout.write = captureWrite
      })
      const pending = runCli(args)
      await written
      process.stdout.emit('error', new Error('downstream failed'))
      expect(await pending).toBe(1)
      expect(JSON.parse(out).ok).toBe(false)
      expect(writes).toBe(1)
      expect(err).toBe('downstream failed\n')
      expect(['drain', 'close', 'error'].map((name) => process.stdout.listenerCount(name))).toEqual(
        counts,
      )
    },
  )

  it.each([
    ['close', '--css'],
    ['error', '--css'],
    ['close', '--json'],
    ['error', '--json'],
    ['close', '--help'],
    ['error', '--help'],
  ])(
    'stops on stdout %s in %s while waiting for drain and removes listeners',
    async (event, mode) => {
      const path = await file('output.css', '.a { width: 24px }')
      const captureWrite = process.stdout.write
      const counts = ['drain', 'close', 'error'].map((name) => process.stdout.listenerCount(name))
      let signal: () => void = () => {}
      const written = new Promise<void>((resolve) => {
        signal = resolve
      })
      process.stdout.write = () => {
        signal()
        return false
      }
      restore.push(() => {
        process.stdout.write = captureWrite
      })
      const pending = runCli([path, mode, '--no-color'])
      await written
      process.stdout.emit(event, new Error('downstream failed'))
      expect(await pending).toBe(1)
      expect(err).toContain(event === 'close' ? 'Output stream closed' : 'downstream failed')
      expect(['drain', 'close', 'error'].map((name) => process.stdout.listenerCount(name))).toEqual(
        counts,
      )
    },
  )

  it('waits for stdout drain before writing the next CSS file', async () => {
    const first = await file('first.css', '.first { width: 24px }')
    const second = await file('second.css', '.second { width: 48px }')
    const captureWrite = process.stdout.write
    let writes = 0
    let resume: () => void = () => {}
    const written = new Promise<void>((resolve) => {
      resume = resolve
    })
    process.stdout.write = (chunk: string) => {
      captureWrite(chunk)
      writes++
      if (writes === 1) {
        resume()
        return false
      }
      return true
    }
    restore.push(() => {
      process.stdout.write = captureWrite
    })
    const pending = runCli([first, second, '--css', '--no-color'])
    await written
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(writes).toBe(1)
    expect(out).not.toContain('.second')
    process.stdout.emit('drain')
    expect(await pending).toBe(0)
    expect(out).toContain('.second')
    expect(writes).toBe(2)
  })

  it.each(['--css', '--json'])(
    'does not echo malformed JSON config contents in %s',
    async (mode) => {
      const secret = 'private-config-secret-92831'
      for (const source of [`{"token":"${secret}" invalid}`, secret, `\uFEFF${secret}`]) {
        const path = await file('invalid.json', source)
        out = ''
        err = ''
        expect(await runCli(['--config', path, mode, '--no-color'])).toBe(1)
        expect(out + err).toContain('Invalid JSON syntax')
        expect(out + err).not.toContain(secret)
        // Node can quote only the first few characters, rather than the full input.
        expect(out + err).not.toContain('private-')
        expect(out + err).not.toContain('"token"')
      }
    },
  )

  it.each(['--css', '--json'])(
    'reports interrupted stdin without publishing partial success in %s mode',
    async (mode) => {
      const stdin = process.stdin
      Object.defineProperty(process, 'stdin', {
        configurable: true,
        value: (function* pipe() {
          yield Buffer.from('.a { width: 24px }')
          throw new Error('input stream interrupted')
        })(),
      })
      restore.push(() =>
        Object.defineProperty(process, 'stdin', { configurable: true, value: stdin }),
      )
      expect(await runCli(['-', mode, '--no-color'])).toBe(1)
      if (mode === '--css') {
        expect(out).toBe('')
        expect(err).toContain('input stream interrupted')
      } else {
        expect(JSON.parse(out)).toMatchObject({ ok: false })
        expect(out).toContain('input stream interrupted')
        expect(out).not.toContain('"files"')
      }
    },
  )

  it.each(['', '\uFEFF.标题 {\r\n  width: 24px;\r\n}\r\n'])(
    'keeps file and chunked stdin CSS output equivalent for %j',
    async (source) => {
      const path = await file('windows.css', source)
      expect(await runCli([path, '--css', '--no-color'])).toBe(0)
      const fileOutput = out
      const fileErrors = err
      out = ''
      err = ''
      const stdin = process.stdin
      const bytes = Buffer.from(source)
      Object.defineProperty(process, 'stdin', {
        configurable: true,
        value: (function* pipe() {
          // Split the BOM and Chinese characters at every byte boundary.
          for (const byte of bytes) yield Buffer.from([byte])
        })(),
      })
      restore.push(() =>
        Object.defineProperty(process, 'stdin', { configurable: true, value: stdin }),
      )
      expect(await runCli(['-', '--css', '--no-color'])).toBe(0)
      expect(out).toBe(fileOutput)
      expect(err).toBe(fileErrors)
      expect(out).not.toContain('\uFFFD')
      if (source) {
        expect(out).toContain('.标题')
        expect(out).toContain('\r\n')
        expect(out).not.toContain('width: 24px')
      }
    },
  )

  it('streams multiple CSS files in argument order without bundling imports', async () => {
    const first = await file('first.css', '.a { width: 24px }')
    const second = await file('second.css', '@import "./theme.css"; .b { height: 48px }')
    expect(await runCli([first, second, '--css', '--no-color'])).toBe(0)
    expect(out.indexOf('.a {')).toBeLessThan(out.indexOf('@import "./theme.css"'))
    expect(out.indexOf('@import "./theme.css"')).toBeLessThan(out.indexOf('.b {'))
    expect(out).toContain('}\n@import')
  })

  it.each(['--json', '--css'])('reports a later parse failure in %s mode', async (mode) => {
    const first = await file('first.css', '.a { width: 24px }')
    const invalid = await file('invalid.css', '.b {')
    expect(await runCli([first, invalid, mode, '--no-color'])).toBe(1)
    if (mode === '--json') {
      const report = JSON.parse(out)
      expect(report.ok).toBe(false)
      expect(report.files).toBeUndefined()
      expect(out).toContain('Unclosed block')
      expect(err).toBe('')
    } else {
      expect(out).toContain('.a { width:')
      expect(out).not.toContain('.b')
      expect(err).toContain('Unclosed block')
      expect(out).not.toContain('Unclosed block')
    }
  })

  it.each([false, true])('reports overflow with warning gate enabled=%s', async (gated) => {
    const path = await file('overflow.css', '.a { margin: 1e308px 24px }')
    expect(await runCli([path, '--json', ...(gated ? ['--fail-on', 'warnings'] : [])])).toBe(
      gated ? 1 : 0,
    )
    const report = JSON.parse(out)
    expect(report.ok).toBe(true)
    expect(report.gate).toEqual(gated ? { failOn: ['warnings'], passed: false } : null)
    expect(report.summary.warnings).toBe(1)
    expect(report.files[0].warnings[0]).toContain('finite numeric range')
    expect(err).toBe('')
  })

  it('emits one error document when a later input file cannot be read', async () => {
    const first = await file('first.css', '.a { padding: 24px }')
    const missing = join(directory, 'missing.css')
    expect(await runCli([first, missing, '--json'])).toBe(1)
    const report = JSON.parse(out)
    expect(report.ok).toBe(false)
    expect(report.formatVersion).toBe(1)
    expect(report.error.message).toContain('missing.css')
    expect(report.files).toBeUndefined()
    expect(report.summary).toBeUndefined()
    expect(err).toBe('')
  })

  it('reports unknown target failure as JSON before opening input files', async () => {
    const missing = join(directory, 'not-created.css')
    expect(
      await runCli([missing, '--json', '--targets', 'netscape 4', '--fail-on', 'compatibility']),
    ).toBe(1)
    const report = JSON.parse(out)
    expect(report.formatVersion).toBe(1)
    expect(report.ok).toBe(false)
    expect(report.error.message).toContain('No support data')
    expect(report.error.message).not.toContain('ENOENT')
    expect(report.files).toBeUndefined()
    expect(err).toBe('')
  })

  it('aggregates a warning gate across clean and warning-producing files', async () => {
    const clean = await file('clean.css', '.a { padding: 24px }')
    const warning = await file('warning.css', '@adaptive missing { .b { padding: 24px } }')
    expect(await runCli([clean, warning, '--json', '--fail-on', 'warnings'])).toBe(1)
    const report = JSON.parse(out)
    expect(report.ok).toBe(true)
    expect(report.gate).toEqual({ failOn: ['warnings'], passed: false })
    expect(report.summary.files).toBe(2)
    expect(report.summary.warnings).toBe(1)
    expect(report.files[0].warnings).toEqual([])
    expect(report.files[1].warnings).toHaveLength(1)
    expect(report.summary.converted).toBe(
      report.files.reduce((sum: number, entry: { converted: number }) => sum + entry.converted, 0),
    )
    expect(err).toBe('')
  })

  it('reports each converted declaration with its before and after', async () => {
    const path = await file('app.css', '.page { padding: 16px; border: 1px solid }')

    expect(await runCli([path, '--no-color'])).toBe(0)
    expect(out).toContain('.page')
    expect(out).toContain('16px')
    expect(out).toContain('clamp(')
    expect(out).toContain('1 converted, 1 left as authored')
  })

  it('emits a versioned machine-readable report with changes and compatibility findings', async () => {
    const path = await file(
      'app.css',
      '.page { padding: 16px; border: 1px solid }\n@adaptive ghost { .lost { width: 10px } }',
    )

    expect(await runCli([path, '--json', '--targets', 'ios_saf 13', '--no-color'])).toBe(0)
    expect(err).toBe('')
    expect(out).not.toContain(String.fromCharCode(27))

    const report = JSON.parse(out) as {
      formatVersion: number
      ok: boolean
      profiles: { default: string; authored: string[]; libraries: number }
      targets: Record<string, string>
      summary: Record<string, number>
      files: Array<{
        file: string
        converted: number
        unchanged: number
        changes: Array<{ context: string; prop: string; before: string | null; after: string }>
        warnings: string[]
        compatibility: {
          findings: Array<{
            id: string
            failure: string
            fallback: string
            shortfalls: Array<{ browser: string; target: string; since: string | null }>
          }>
        }
      }>
    }
    expect(report.formatVersion).toBe(1)
    expect(report.ok).toBe(true)
    expect(report.profiles.default).toBe('app')
    expect(report.profiles.authored).toEqual(['app', 'pc'])
    expect(report.profiles.libraries).toBeGreaterThan(5)
    expect(report.targets).toEqual({ ios_saf: '13' })
    expect(report.summary).toMatchObject({ files: 1, converted: 1, unchanged: 2, warnings: 1 })
    expect(report.files[0]!.changes).toEqual([
      expect.objectContaining({ context: '.page', prop: 'padding', before: '16px' }),
    ])
    expect(report.files[0]!.warnings[0]).toContain('Unknown adaptive profile "ghost"')
    expect(report.files[0]!.compatibility.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'math-functions',
          failure: expect.any(String),
          fallback: expect.any(String),
          shortfalls: [
            expect.objectContaining({ browser: 'ios_saf', target: '13', since: '13.4-13.7' }),
          ],
        }),
      ]),
    )
  })

  it('writes one JSON document for several files and includes unchanged declarations with --all', async () => {
    const first = await file('first.css', '.a { width: 16px; color: red }')
    const second = await file('second.css', '.b { height: 24px }')

    expect(await runCli([first, second, '--json', '--all'])).toBe(0)
    const report = JSON.parse(out) as {
      summary: { files: number; converted: number; unchanged: number; declarations: number }
      files: Array<{ changes: Array<{ prop: string }> }>
    }
    expect(report.summary).toEqual(
      expect.objectContaining({ files: 2, converted: 2, unchanged: 1, declarations: 3 }),
    )
    expect(report.files).toHaveLength(2)
    expect(report.files[0]!.changes.map((change) => change.prop)).toEqual(['width', 'color'])
  })

  it('keeps JSON errors parseable and preserves a non-zero exit code', async () => {
    expect(await runCli(['--json', '--css'])).toBe(1)
    expect(err).toBe('')
    expect(JSON.parse(out)).toEqual({
      formatVersion: 1,
      ok: false,
      error: { message: '--json and --css are different output formats; choose one.' },
    })

    out = ''
    expect(await runCli(['--unknown', '--json'])).toBe(1)
    expect(JSON.parse(out)).toMatchObject({
      formatVersion: 1,
      ok: false,
      error: { message: 'Unknown option --unknown.' },
    })
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

  it('can turn compiler warnings into a failing CI quality gate', async () => {
    const path = await file('app.css', '@adaptive nope { .page { padding: 16px } }')

    expect(await runCli([path, '--no-color', '--fail-on', 'warnings'])).toBe(1)
    expect(out).toContain('Unknown adaptive profile "nope"')
    expect(err).toContain('Quality gate failed: warnings=1')

    out = ''
    err = ''
    expect(await runCli([path, '--css', '--fail-on', 'warnings'])).toBe(1)
    expect(out).toContain('.page')
    expect(out).not.toContain('Quality gate')
    expect(err).toContain('Unknown adaptive profile "nope"')
    expect(err).toContain('Quality gate failed: warnings=1')
  })

  it('keeps full continuity evidence on stderr in --css mode', async () => {
    const path = await file(
      'app.css',
      '.card { font-size: 16px }\n@adaptive pc { .card { font-size: 18px } }',
    )

    expect(await runCli([path, '--css', '--fail-on', 'continuity', '--no-color'])).toBe(1)
    expect(out).toContain('.card')
    expect(out).not.toContain('shrinks')
    expect(err).toContain('shrinks .card font-size')
    expect(err).toContain('Quality gate failed: continuity=1')
  })

  it('keeps full compatibility evidence on stderr in --css mode', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(
      await runCli([
        path,
        '--css',
        '--targets',
        'ios_saf 13',
        '--fail-on',
        'compatibility',
        '--no-color',
      ]),
    ).toBe(1)
    expect(out).toContain('.page')
    expect(out).not.toContain('needs clamp()')
    expect(err).toContain('needs clamp(), min(), max()')
    expect(err).toContain('if unsupported:')
    expect(err).toMatch(/Quality gate failed: compatibility=\d+/)
  })

  it('separates successful JSON compilation from a failed continuity gate', async () => {
    const path = await file(
      'app.css',
      '.card { font-size: 16px }\n@adaptive pc { .card { font-size: 18px } }',
    )

    expect(await runCli([path, '--json', '--fail-on', 'continuity'])).toBe(1)
    expect(err).toBe('')
    const report = JSON.parse(out) as {
      ok: boolean
      summary: { continuityIssues: number }
      gate: { failOn: string[]; passed: boolean }
    }
    expect(report.ok).toBe(true)
    expect(report.summary.continuityIssues).toBe(1)
    expect(report.gate).toEqual({ failOn: ['continuity'], passed: false })
  })

  it('passes a requested gate with no selected findings', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '--json', '--fail-on', 'warnings'])).toBe(0)
    expect(JSON.parse(out).gate).toEqual({ failOn: ['warnings'], passed: true })
  })

  it('requires targets for a compatibility gate before reading the stylesheet', async () => {
    const missing = join(directory, 'missing.css')

    expect(await runCli([missing, '--fail-on', 'compatibility'])).toBe(1)
    expect(err).toContain('requires --targets')
    expect(err).not.toContain('missing.css')
  })

  it('fails a compatibility gate on unsupported compiled syntax', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(
      await runCli([path, '--targets', 'ios_saf 13', '--fail-on', 'compatibility', '--no-color']),
    ).toBe(1)
    expect(out).toContain('needs clamp(), min(), max()')
    expect(err).toMatch(/Quality gate failed: compatibility=\d+/)
  })

  it('rejects unknown or empty quality-gate categories', async () => {
    expect(await runCli(['--fail-on', 'security'])).toBe(1)
    expect(err).toContain('Unknown --fail-on category "security"')

    err = ''
    expect(await runCli(['--fail-on', ','])).toBe(1)
    expect(err).toContain('--fail-on needs warnings, continuity, compatibility or any')
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

  it('does not mutate a cached or frozen config when --profile overrides it', async () => {
    const config = join(directory, 'frozen.config.mjs')
    await writeFile(
      config,
      `const config = {
        defaultProfile: 'app',
        profiles: {
          app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
          pc: { designWidth: 1440, fluid: { minWidth: 768, maxWidth: 1920 } }
        }
      }; export default Object.freeze(config)`,
      'utf8',
    )
    const path = await file('app.css', '.page { padding: 144px }')

    expect(await runCli([path, '--no-color', '-c', config, '--profile', 'pc'])).toBe(0)
    expect(out).toContain('10vw')

    out = ''
    expect(await runCli([path, '--no-color', '-c', config])).toBe(0)
    expect(out).toContain('38.4vw')
    expect(out).not.toContain('pc (default)')
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

  it('resolves a functional rootValue independently for every input file', async () => {
    const config = join(directory, 'root-value.config.mjs')
    await writeFile(
      config,
      `export default {
        libraries: false,
        strategy: 'viewport',
        hairline: 0,
        unitToConvert: ['rem'],
        profiles: { app: { designWidth: 100 } },
        rootValue: ({ file }) => file.endsWith('ten.css') ? 10 : 16
      }`,
      'utf8',
    )
    const ten = await file('ten.css', '.ten { width: 1rem }')
    const sixteen = await file('sixteen.css', '.sixteen { width: 1rem }')

    expect(await runCli([ten, sixteen, '--json', '-c', config])).toBe(0)
    const report = JSON.parse(out) as {
      files: Array<{ changes: Array<{ after: string }> }>
    }
    expect(report.files[0]!.changes[0]!.after).toBe('10vw')
    expect(report.files[1]!.changes[0]!.after).toBe('16vw')
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

  it('reads a BOM-prefixed JSON config with a case-insensitive extension', async () => {
    const config = join(directory, 'adaptive.JSON')
    await writeFile(
      config,
      `\uFEFF${JSON.stringify({ profiles: { mobile: 390 }, libraries: false })}`,
      'utf8',
    )
    const path = await file('mobile.css', '.page { width: 39px }')

    expect(await runCli([path, '--no-color', '-c', config])).toBe(0)
    expect(out).toContain('mobile (default)')
    expect(out).toContain('10vw')
    expect(err).toBe('')
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

  it('also reads a UTF-8 string stream when the host setEncoding first', async () => {
    const stdin = process.stdin
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: (function* pipe() {
        yield '.page { padding: '
        yield '16px }'
      })(),
    })
    restore.push(() =>
      Object.defineProperty(process, 'stdin', { configurable: true, value: stdin }),
    )

    expect(await runCli(['--no-color', '--from', '/project/src/app.css'])).toBe(0)
    expect(out).toContain('.page')
    expect(out).toContain('1 converted')
  })

  it('preserves a multibyte character split across binary stdin chunks', async () => {
    const stdin = process.stdin
    const source = Buffer.from('.标题 { width: 16px }')
    const split = source.indexOf(Buffer.from('标')) + 1
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: (function* pipe() {
        yield source.subarray(0, split)
        yield source.subarray(split)
      })(),
    })
    restore.push(() =>
      Object.defineProperty(process, 'stdin', { configurable: true, value: stdin }),
    )

    expect(await runCli(['--no-color'])).toBe(0)
    expect(out).toContain('.标题')
    expect(out).not.toContain('�')
  })

  it('rejects mixing explicit stdin with file inputs instead of ignoring either source', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli(['-', path, '--no-color'])).toBe(1)
    expect(err).toContain('Stdin (-) cannot be mixed with file paths')
    expect(out).toBe('')

    err = ''
    expect(await runCli([path, '-', '--json'])).toBe(1)
    expect(err).toBe('')
    expect(JSON.parse(out)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('Stdin (-) cannot be mixed') },
    })
  })

  it('rejects one --from override for several files before reading them', async () => {
    const first = join(directory, 'missing-a.css')
    const second = join(directory, 'missing-b.css')

    expect(await runCli([first, second, '--from', 'src/app.css', '--no-color'])).toBe(1)
    expect(err).toContain('--from names one logical source path')
    expect(err).not.toContain('missing-a.css')
    expect(out).toBe('')
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

  it('treats arguments after -- as file paths', async () => {
    const cwd = process.cwd()
    restore.push(() => process.chdir(cwd))
    process.chdir(directory)
    await file('-draft.css', '.draft { width: 100px }')

    expect(await runCli(['--no-color', '--', '-draft.css'])).toBe(0)
    expect(out).toContain('.draft')
    expect(err).toBe('')
  })

  it('does not treat --json after the option terminator as a flag on parse errors', async () => {
    expect(await runCli(['--unknown', '--', '--json'])).toBe(1)
    expect(out).toBe('')
    expect(err).toContain('Unknown option --unknown')
  })

  it('fails when an option is missing its value', async () => {
    expect(await runCli(['--profile'])).toBe(1)
    expect(err).toContain('--profile needs a value')

    err = ''
    expect(await runCli(['--profile='])).toBe(1)
    expect(err).toContain('--profile needs a value')
  })

  it('accepts long option values in equals form', async () => {
    const path = await file('inline-options.css', '.page { width: 16px }')

    expect(
      await runCli([
        path,
        '--profile=app',
        '--targets=safari 14',
        '--fail-on=warnings',
        '--no-color',
      ]),
    ).toBe(0)
    expect(out).toContain('.page')
    expect(err).toBe('')
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

  it.each(['json', 'mjs'])(
    'explains a PostCSS wrapper in a %s config before reading CSS',
    async (extension) => {
      const config = join(directory, `postcss.config.${extension}`)
      const options = JSON.stringify({ plugins: [] })
      await writeFile(config, extension === 'json' ? options : `export default ${options}`, 'utf8')
      expect(await runCli([join(directory, 'absent.css'), '-c', config, '--json'])).toBe(1)
      expect(err).toBe('')
      const report = JSON.parse(out)
      expect(report.ok).toBe(false)
      expect(report.error.message).toContain('PostCSS "plugins" wrapper')
      expect(report.error.message).toContain('adaptive.config.mjs')
      expect(report.error.message).not.toContain('absent.css')
    },
  )

  it('rejects an array exported from a config module just like an array in JSON', async () => {
    const config = join(directory, 'array.config.mjs')
    await writeFile(config, 'export default []', 'utf8')

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

  it('rejects an unknown route target before trying to open the input file', async () => {
    const config = join(directory, 'unknown-route.config.json')
    await writeFile(
      config,
      JSON.stringify({ routes: [{ profile: 'ghost', selector: '.ghost' }] }),
      'utf8',
    )

    expect(await runCli([join(directory, 'absent.css'), '-c', config, '--no-color'])).toBe(1)
    expect(err).toContain('routes[0].profile targets unknown profile "ghost"')
    expect(err).not.toContain('absent.css')
    expect(out).toBe('')
  })

  it('reports a misspelled JSON field with a suggestion before reading input', async () => {
    const config = join(directory, 'typo.config.json')
    await writeFile(config, JSON.stringify({ minPixeValue: 2 }), 'utf8')

    expect(
      await runCli([join(directory, 'absent.css'), '-c', config, '--json', '--no-color']),
    ).toBe(1)
    expect(err).toBe('')
    expect(JSON.parse(out)).toMatchObject({
      formatVersion: 1,
      ok: false,
      error: { message: expect.stringMatching(/minPixeValue.*Did you mean "minPixelValue"/) },
    })
    expect(out).not.toContain('absent.css')
  })

  it('reports the exact path of a malformed JSON option without a stack trace', async () => {
    const config = join(directory, 'invalid.config.json')
    await writeFile(
      config,
      JSON.stringify({
        profiles: {
          app: {
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            query: { type: 'media' },
          },
        },
      }),
      'utf8',
    )
    const path = await file('app.css', '.page { padding: 16px }')

    expect(await runCli([path, '-c', config, '--no-color'])).toBe(1)
    expect(err).toContain('Profile "app" query.condition must be a non-empty string')
    expect(err).not.toContain('at resolveOptions')
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

  it('validates version grammar and comparison direction', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    for (const target of ['safari 1..2', 'safari 17.', 'safari < 17', 'safari > 17']) {
      err = ''
      expect(await runCli([path, '--targets', target]), target).toBe(1)
      expect(err, target).toContain('Could not read target')
    }
    expect(await runCli([path, '--targets', 'safari >= 17', '--no-color'])).toBe(0)
    expect(await runCli([path, '--targets', 'safari@17', '--no-color'])).toBe(0)
  })

  it('keeps the oldest duplicate alias regardless of argument order', async () => {
    const path = await file('app.css', '.page { padding: 16px }')

    expect(
      await runCli([path, '--json', '--targets', 'chrome 120, android 79', '--no-color']),
    ).toBe(0)
    expect((JSON.parse(out) as { targets: Record<string, string> }).targets).toEqual({
      chrome: '79',
    })

    out = ''
    expect(
      await runCli([path, '--json', '--targets', 'android 79, chrome 120', '--no-color']),
    ).toBe(0)
    expect((JSON.parse(out) as { targets: Record<string, string> }).targets).toEqual({
      chrome: '79',
    })
  })
})
