import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const script = fileURLToPath(new URL('../scripts/verify-libraries.ts', import.meta.url))

it.each([
  { width: '24px', status: 0, warnings: 0 },
  { width: '1e309px', status: 1, warnings: 1 },
])(
  'library verifier exits $status for $width',
  async ({ width, status, warnings }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-library-verifier-'))
    try {
      const packaged = join(directory, '.libcheck', 'vant', 'package')
      await mkdir(packaged, { recursive: true })
      await writeFile(join(packaged, 'package.json'), JSON.stringify({ version: '0.0.0-test' }))
      await writeFile(
        join(packaged, 'index.css'),
        `.van-button { --van-gap: 24px; width: ${width} }`,
      )
      const result = spawnSync(
        process.execPath,
        ['--import', pathToFileURL(require.resolve('tsx')).href, script, 'vant'],
        { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, CLEAN: '' } },
      )
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr + result.stdout).toBe(status)
      expect(result.stdout).toContain('vant@0.0.0-test (cached)')
      expect(result.stdout).toContain(`0 seams, ${warnings} warns`)
      expect(result.stdout).toContain(`1 checked, ${status} needing attention`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  30_000,
)
