import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each(['valid', 'absolute', 'missing-content', 'extra-file', 'missing-map'])(
  'checks isolated package fixture: %s',
  async (variant) => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-pack-check-'))
    try {
      await mkdir(join(directory, 'scripts'))
      await mkdir(join(directory, 'dist'))
      await copyFile(
        new URL('../scripts/check-package.mjs', import.meta.url),
        join(directory, 'scripts/check-package.mjs'),
      )
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.0', main: './dist/index.js' }),
      )
      const files = [
        'README.md',
        'README.zh-CN.md',
        'LICENSE',
        'package.json',
        'dist/index.js',
        'dist/index.js.map',
      ]
      if (variant === 'extra-file') files.push('dist/private.txt')
      if (variant === 'missing-map') files.splice(files.indexOf('dist/index.js.map'), 1)
      await writeFile(join(directory, 'dist/index.js'), '//# sourceMappingURL=index.js.map\n')
      // Mock only npm's inventory; execute the real package-check script and map reader.
      await writeFile(
        join(directory, 'npm-fixture.cjs'),
        `process.stdout.write(${JSON.stringify(JSON.stringify([{ files: files.map((path) => ({ path })) }]))})`,
      )
      await writeFile(
        join(directory, 'dist/index.js.map'),
        JSON.stringify({
          version: 3,
          sources: [variant === 'absolute' ? 'C:/private/source.ts' : '../src/index.ts'],
          sourcesContent: variant === 'missing-content' ? [] : ['export {}'],
          mappings: '',
        }),
      )
      const result = spawnSync(process.execPath, [join(directory, 'scripts/check-package.mjs')], {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'npm_execpath'),
          ),
          npm_execpath: join(directory, 'npm-fixture.cjs'),
        },
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(variant === 'valid' ? 0 : 1)
      if (variant === 'extra-file') expect(result.stderr).toContain('undeclared files')
      if (variant === 'absolute' || variant === 'missing-content') {
        expect(result.stderr).toContain('not self-contained and portable')
      }
      if (variant === 'missing-map') expect(result.stderr).toContain('source map reference')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
