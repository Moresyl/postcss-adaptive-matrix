import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function inspect(files: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-pack-check-'))
  directories.push(directory)
  await mkdir(join(directory, 'scripts'))
  await copyFile(
    new URL('../scripts/check-package.mjs', import.meta.url),
    join(directory, 'scripts/check-package.mjs'),
  )
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      version: '1.0.0',
      main: './dist/index.cjs',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } },
        './runtime': './dist/runtime.js',
      },
      bin: { fixture: './dist/cli.js' },
    }),
  )
  for (const file of files) {
    const target = join(directory, file)
    await mkdir(join(target, '..'), { recursive: true })
    if (file.endsWith('.map')) {
      await writeFile(
        target,
        JSON.stringify({
          version: 3,
          sources: ['../src/index.ts'],
          sourcesContent: [''],
          mappings: '',
        }),
      )
    } else {
      await writeFile(target, '')
    }
  }
  const npm = join(directory, 'fake-npm.cjs')
  await writeFile(
    npm,
    `console.log(${JSON.stringify(JSON.stringify([{ files: files.map((path) => ({ path })) }]))})`,
  )
  return spawnSync(process.execPath, [join(directory, 'scripts/check-package.mjs')], {
    encoding: 'utf8',
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_execpath'),
      ),
      npm_execpath: npm,
    },
  })
}

const complete = [
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'dist/index.cjs',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/runtime.js',
  'dist/cli.js',
  'dist/index.cjs.map',
  'dist/index.js.map',
  'dist/runtime.js.map',
  'dist/cli.js.map',
]

describe('package entrypoint gate', () => {
  it('accepts a package containing every declared entrypoint', async () => {
    const result = await inspect(complete)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('all declared entrypoints included')
  })

  it('rejects npm success when the build artifacts are absent', async () => {
    const result = await inspect(['README.md', 'README.zh-CN.md', 'LICENSE'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('dist/index.js')
    expect(result.stderr).toContain('Run npm run build first')
  })

  it.each(['dist/index.d.ts', 'dist/runtime.js', 'dist/cli.js', 'README.zh-CN.md'])(
    'rejects a package missing %s',
    async (missing) => {
      const result = await inspect(complete.filter((file) => file !== missing))
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(missing)
    },
  )
})
