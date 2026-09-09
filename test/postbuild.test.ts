import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it('keeps callable CommonJS code and declarations unchanged on a second postbuild pass', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-postbuild-'))
  try {
    const dist = join(directory, 'dist')
    await mkdir(dist)
    const jsPath = join(dist, 'index.cjs')
    const typesPath = join(dist, 'index.d.cts')
    await writeFile(jsPath, 'exports.default = function plugin() {}; exports.helper = () => 42;\n')
    await writeFile(
      typesPath,
      'declare function plugin(): void;\ndeclare function helper(): number;\ninterface Options { enabled?: boolean }\nexport { plugin as default, helper, type Options };\n',
    )
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          fileURLToPath(new URL('../scripts/postbuild.ts', import.meta.url)),
        ],
        { cwd: directory, encoding: 'utf8', timeout: 15_000 },
      )
    const first = run()
    expect(first.error).toBeUndefined()
    expect(first.status, first.stderr).toBe(0)
    const js = await readFile(jsPath, 'utf8')
    const types = await readFile(typesPath, 'utf8')
    expect(types).toContain('export = _cjs;')
    expect(types).toContain('helper: typeof helper;')
    expect(types).toContain('export { type Options };')
    const exported = require(jsPath) as { (): void; default: unknown; helper(): number }
    expect(typeof exported).toBe('function')
    expect(exported.default).toBe(exported)
    expect(exported.helper()).toBe(42)
    delete require.cache[jsPath]
    const second = run()
    expect(second.error).toBeUndefined()
    expect(second.status, second.stderr).toBe(0)
    expect(await readFile(jsPath, 'utf8')).toBe(js)
    expect(await readFile(typesPath, 'utf8')).toBe(types)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 35_000)
