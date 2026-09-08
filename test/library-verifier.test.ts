import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

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
      expect(result.stdout).toContain(`1 checked, ${problems} needing attention`)
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
