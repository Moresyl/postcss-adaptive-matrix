import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

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
