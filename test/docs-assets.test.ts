import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  generatedAssets,
  generatedAssetMap,
  writeGeneratedAssets,
} from '../docs/.vitepress/generated.js'
import { rewrite, siteHref } from '../docs/.vitepress/paths.js'

function middleware() {
  let handler: (
    request: { url: string; method?: string },
    response: {
      setHeader: ReturnType<typeof vi.fn>
      end: ReturnType<typeof vi.fn>
    },
    next: ReturnType<typeof vi.fn>,
  ) => void
  const hook = generatedAssets().configureServer as CallableFunction
  hook({
    config: { base: '/project/' },
    middlewares: {
      use: (value: typeof handler) => {
        handler = value
      },
    },
  })
  return (url: string, method = 'GET') => {
    const response = { setHeader: vi.fn(), end: vi.fn() }
    const next = vi.fn()
    handler({ url, method }, response, next)
    return { response, next }
  }
}

describe('documentation asset delivery', () => {
  it('checks production assets and rejects stale content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-docs-gate-'))
    try {
      await writeGeneratedAssets(directory)
      const check = () =>
        execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            fileURLToPath(new URL('../scripts/check-docs-assets.ts', import.meta.url)),
            directory,
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      expect(check()).toContain('assets match their sources')
      await writeFile(join(directory, 'docs/configuration.md'), 'stale')
      expect(check).toThrow('Stale generated asset: docs/configuration.md')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('writes every generated asset byte-for-byte into a production directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'adaptive-docs-assets-'))
    try {
      await writeGeneratedAssets(directory)
      for (const [name, body] of generatedAssetMap()) {
        expect(await readFile(join(directory, name), 'utf8'), name).toBe(body)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves bilingual routes, fragments and external links', () => {
    expect(rewrite('docs/home.zh-CN.md')).toBe('zh/index.md')
    expect(siteHref('./configuration.zh-CN.md#adaptiveprofile', 'docs/README.zh-CN.md')).toBe(
      '/zh/docs/configuration#adaptiveprofile',
    )
    expect(siteHref('https://example.com', 'docs/README.md')).toBeNull()
    expect(siteHref('../../outside.md', 'docs/README.md')).toBeNull()
  })

  it('generates raw pages, localized AI indexes and schema from source', () => {
    const assets = generatedAssetMap()
    expect(assets.get('docs/configuration.md')).toContain('# Configuration')
    expect(assets.get('zh/docs/configuration.md')).toContain('配置')
    for (const name of ['llms.txt', 'zh/llms.txt', 'llms-full.txt', 'zh/llms-full.txt']) {
      expect(assets.get(name)?.length).toBeGreaterThan(100)
      expect(assets.get(name)).toContain('API')
    }
    expect(assets.get('llms.txt')).toContain('/docs/api')
    expect(assets.get('zh/llms.txt')).toContain('/zh/docs/api')
    expect(assets.get('llms-full.txt')).toContain('AdaptiveCompileGateCategory')
    expect(assets.get('zh/llms-full.txt')).toContain('AdaptiveCompileGateCategory')
    expect(JSON.parse(assets.get('schema/options.json')!).properties).toHaveProperty('profiles')
    expect([...assets.keys()].some((name) => name.startsWith('.upgrade'))).toBe(false)
  })

  it('serves Markdown with its MIME type under the deployment base', () => {
    const { response, next } = middleware()('/project/docs/configuration.md?raw=1')
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/markdown; charset=utf-8')
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('# Configuration'))
    expect(next).not.toHaveBeenCalled()
  })

  it('passes unknown assets through without responding', () => {
    const { response, next } = middleware()('/project/missing.md')
    expect(next).toHaveBeenCalledOnce()
    expect(response.end).not.toHaveBeenCalled()
  })

  it('returns headers without a body for HEAD requests', () => {
    const { response, next } = middleware()('/project/docs/configuration.md', 'HEAD')
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/markdown; charset=utf-8')
    expect(response.end).toHaveBeenCalledWith()
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('does not claim %s requests', (method) => {
    const { response, next } = middleware()('/project/docs/configuration.md', method)
    expect(next).toHaveBeenCalledOnce()
    expect(response.end).not.toHaveBeenCalled()
  })

  it.each(['/project/app.js', '/project/theme.css', '/project/@vite/client', '/project/icon.png'])(
    'leaves unrelated assets to the host: %s',
    (url) => {
      const { response, next } = middleware()(url)
      expect(next).toHaveBeenCalledOnce()
      expect(response.end).not.toHaveBeenCalled()
    },
  )

  it('passes malformed URL encoding through without crashing', () => {
    const { response, next } = middleware()('/project/%E0%A4%A')
    expect(next).toHaveBeenCalledOnce()
    expect(response.end).not.toHaveBeenCalled()
  })
})
