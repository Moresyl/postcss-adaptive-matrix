import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const script = fileURLToPath(new URL('../scripts/postbuild.ts', import.meta.url))
const run = (cwd: string) =>
  spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, script], {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
  })

it.each(['index.cjs', 'index.d.cts'])(
  'preserves the other artifact when %s is missing and recovers after it is supplied',
  async (missing) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-postbuild-missing-'))
    const sources: Record<string, string> = {
      'index.cjs': 'exports.default = function plugin() {};\n',
      'index.d.cts': 'declare function plugin(): void; export { plugin as default };\n',
    }
    try {
      const dist = join(directory, 'dist')
      await mkdir(dist)
      const existing = missing === 'index.cjs' ? 'index.d.cts' : 'index.cjs'
      await writeFile(join(dist, existing), sources[existing]!)
      const result = run(directory)
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('ENOENT')
      expect(result.stderr).toContain(missing)
      expect(await readFile(join(dist, existing), 'utf8')).toBe(sources[existing])
      await expect(readFile(join(dist, missing), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      await writeFile(join(dist, missing), sources[missing]!)
      const retry = run(directory)
      expect(retry.error).toBeUndefined()
      expect(retry.status, retry.stderr).toBe(0)
      expect(await readFile(join(dist, 'index.d.cts'), 'utf8')).toContain('export = _cjs;')
      expect(
        (await readFile(join(dist, 'index.cjs'), 'utf8')).match(
          /\/\* callable module\.exports \*\//g,
        ),
      ).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  35_000,
)

it('postprocesses callable CJS declarations and remains byte-identical on repeat', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-postbuild-'))
  try {
    await mkdir(join(directory, 'dist'))
    const js = join(directory, 'dist/index.cjs')
    const types = join(directory, 'dist/index.d.cts')
    await writeFile(js, 'exports.default = function plugin() {}; exports.helper = () => 42;\n')
    await writeFile(
      types,
      'declare function plugin(): void;\ndeclare function helper(): number;\ninterface Options { enabled?: boolean }\nexport { plugin as default, helper, type Options };\n',
    )
    const first = run(directory)
    expect(first.error).toBeUndefined()
    expect(first.status, first.stderr).toBe(0)
    const before = await Promise.all([readFile(js, 'utf8'), readFile(types, 'utf8')])
    expect(before[0]).toContain('/* callable module.exports */')
    expect(before[1]).toContain('export = _cjs;')
    expect(before[1]).toContain('helper: typeof helper;')
    expect(before[1]).toContain('export { type Options };')
    const exported = require(js) as { (): void; default: unknown; helper(): number }
    expect(typeof exported).toBe('function')
    expect(exported.default).toBe(exported)
    expect(exported.helper()).toBe(42)
    delete require.cache[js]
    const second = run(directory)
    expect(second.error).toBeUndefined()
    expect(second.status, second.stderr).toBe(0)
    expect(await Promise.all([readFile(js, 'utf8'), readFile(types, 'utf8')])).toEqual(before)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

it.each([
  ['declare const value: number;', 'no trailing export statement'],
  ['declare const value: number; export { value };', 'no default export'],
  ['declare const value: number; export { value as other as default };', 'cannot read export'],
])(
  'rejects unsupported declaration layout: %s',
  async (source, reason) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-postbuild-invalid-'))
    try {
      await mkdir(join(directory, 'dist'))
      await writeFile(join(directory, 'dist/index.cjs'), 'exports.default = function() {};')
      const types = join(directory, 'dist/index.d.cts')
      await writeFile(types, source)
      const result = run(directory)
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(reason)
      expect(await readFile(types, 'utf8')).toBe(source)
      expect(await readFile(join(directory, 'dist/index.cjs'), 'utf8')).toBe(
        'exports.default = function() {};',
      )
      // A later successful retry must then create exactly one wrapper.
      await writeFile(types, 'declare function plugin(): void; export { plugin as default };')
      const retry = run(directory)
      expect(retry.error).toBeUndefined()
      expect(retry.status, retry.stderr).toBe(0)
      expect(await readFile(types, 'utf8')).toContain('export = _cjs;')
      const js = await readFile(join(directory, 'dist/index.cjs'), 'utf8')
      expect(js.match(/\/\* callable module\.exports \*\//g)).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  20_000,
)
