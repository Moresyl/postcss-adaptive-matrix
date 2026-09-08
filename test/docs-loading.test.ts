import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each(['dynamic', 'static', 'reexport', 'preload'])(
  'checks %s interactive dependencies in built documentation',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'docs-loading-'))
    try {
      await writeFile(
        join(directory, 'index.html'),
        '<script type="module" src="/test/app.js"></script>' +
          (mode === 'preload'
            ? '<link rel="modulepreload" href="/test/Playground.fixture.js">'
            : ''),
      )
      await writeFile(join(directory, 'app.js'), 'import "./shared.js"')
      await writeFile(
        join(directory, 'shared.js'),
        mode === 'static'
          ? 'import "./Playground.fixture.js"'
          : mode === 'reexport'
            ? 'export * from "./Playground.fixture.js"'
            : 'export const load = () => import("./Playground.fixture.js")',
      )
      await writeFile(join(directory, 'Playground.fixture.js'), 'export const value = 1')
      const run = () =>
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL('../scripts/check-docs-loading.mjs', import.meta.url)), directory],
          { env: { ...process.env, DOCS_BASE: '/test/' }, encoding: 'utf8', stdio: 'pipe' },
        )
      if (mode === 'dynamic') expect(run()).toContain('1 pages')
      else expect(run).toThrow('Interactive-only code loaded eagerly')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
