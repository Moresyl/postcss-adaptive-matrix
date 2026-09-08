import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

it('continues to the RTL check after a compiler exception in the LTR file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-compile-'))
  try {
    const packaged = join(directory, '.libcheck', 'quasar', 'package', 'dist')
    await mkdir(packaged, { recursive: true })
    await writeFile(join(packaged, 'quasar.css'), '.q-button { --reject-compile-fixture: 24px }')
    await writeFile(join(packaged, 'quasar.rtl.css'), '.q-button { margin-right: 24px }')
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(require.resolve('tsx')).href,
        '--import',
        new URL('./fixtures/reject-library-compile.mjs', import.meta.url).href,
        fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
        'quasar',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('COMPILATION FAILED: fixture compilation rejected')
    expect(result.stdout).toContain('quasar.rtl.css')
    expect(result.stdout).toContain('2 reviewed, 1 needing attention')
    expect(result.stdout).toContain('1 static stylesheet checks completed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)

it.each(['both', 'ltr-only', 'rtl-only'])(
  'requires both Quasar direction files: %s',
  async (variant) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-quasar-'))
    try {
      const packaged = join(directory, '.libcheck', 'quasar', 'package', 'dist')
      await mkdir(packaged, { recursive: true })
      if (variant !== 'rtl-only') {
        await writeFile(join(packaged, 'quasar.css'), '.q-button { margin-left: 24px }')
      }
      if (variant !== 'ltr-only') {
        await writeFile(join(packaged, 'quasar.rtl.css'), '.q-button { margin-right: 24px }')
      }
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
          'quasar',
        ],
        { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
      )
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(variant === 'both' ? 0 : 1)
      expect(result.stdout).toContain(`2 reviewed, ${variant === 'both' ? 0 : 1} needing attention`)
      expect(result.stdout).toContain(
        `${variant === 'both' ? 2 : 1} static stylesheet checks completed, 0 runtime-only libraries skipped`,
      )
      if (variant !== 'both') {
        expect(result.stdout).toContain(
          `MISSING STYLESHEET: dist/${variant === 'ltr-only' ? 'quasar.rtl.css' : 'quasar.css'}`,
        )
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  20_000,
)

it('reports runtime-only libraries as skipped rather than statically verified', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-runtime-'))
  try {
    await mkdir(join(directory, '.libcheck', 'naive-ui', 'package'), { recursive: true })
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(require.resolve('tsx')).href,
        fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
        'naive-ui',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      '0 static stylesheet checks completed, 1 runtime-only libraries skipped',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)

it('continues after malformed CSS and reports the remaining valid library', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-invalid-'))
  try {
    const packaged = join(directory, '.libcheck', 'antd-mobile', 'package')
    await mkdir(join(packaged, 'bundle'), { recursive: true })
    await mkdir(join(packaged, '2x', 'bundle'), { recursive: true })
    await writeFile(join(packaged, 'bundle', 'style.css'), '.adm-button {')
    await writeFile(
      join(packaged, '2x', 'bundle', 'style.css'),
      ':root { --adm-size: 24px } .adm-button { width: 24px }',
    )
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(require.resolve('tsx')).href,
        fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
        'antd-mobile',
        'antd-mobile-2x',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('STYLESHEET FAILED:')
    expect(result.stdout).toContain('Unclosed block')
    expect(result.stdout).toContain('library:antd-mobile-2x')
    expect(result.stdout).toContain('2 reviewed, 1 needing attention')
    expect(result.stdout).toContain(
      '1 static stylesheet checks completed, 0 runtime-only libraries skipped',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)

it('reports a missing pinned stylesheet and continues checking remaining targets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-missing-'))
  try {
    const packaged = join(directory, '.libcheck', 'antd-mobile', 'package')
    await mkdir(packaged, { recursive: true })
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(require.resolve('tsx')).href,
        fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
        'antd-mobile',
        'antd-mobile-2x',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('MISSING STYLESHEET: bundle/style.css')
    expect(result.stdout).toContain('MISSING STYLESHEET: 2x/bundle/style.css')
    expect(result.stdout).toContain('2 reviewed, 2 needing attention')
    expect(result.stderr).not.toContain('ENOENT')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)

it.each([
  {
    css: ':root { --van-size: 24px } .van-button { width: 1e309px }',
    status: 1,
    problems: 1,
  },
  { css: '.unrelated { width: 24px }', status: 1, problems: 1 },
  {
    css: ':root { --van-size: 24px } .van-button { width: var(--van-size) }',
    status: 0,
    problems: 0,
  },
])(
  'reports fixture findings with exit code $status',
  async ({ css, status, problems }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-gate-'))
    try {
      const packaged = join(directory, '.libcheck', 'vant', 'package')
      await mkdir(packaged, { recursive: true })
      await writeFile(join(packaged, 'index.css'), css)
      await writeFile(join(packaged, 'package.json'), JSON.stringify({ version: '1.2.3-fixture' }))
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url)),
          'vant',
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 15_000,
          env: { ...process.env, CLEAN: '' },
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(status)
      expect(result.stdout).toContain(`1 reviewed, ${problems} needing attention`)
      expect(result.stdout).toContain('vant: vant@1.2.3-fixture (cached)')
      if (css.includes('1e309px')) expect(result.stdout).toContain('0 seams, 1 warns')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  20_000,
)

it('rejects unknown library names before attempting downloads', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/verify-libraries.ts', 'vant', 'not-a-library'],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, CLEAN: '' },
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Unknown libraries: not-a-library')
  expect(result.stdout).not.toContain('checked')
}, 20_000)
