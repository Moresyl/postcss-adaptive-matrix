import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { localeSearchIndex, rewrittenLocaleSearch } from '../docs/.vitepress/search.js'
import MiniSearch from 'minisearch'

const transform = rewrittenLocaleSearch().transform as (
  code: string,
  id: string,
) => { code: string; map: null } | undefined

function evaluate(expression: string): Record<string, () => string> {
  const result = transform(`export default ${expression}`, '/@localSearchIndex')!
  // Only test-owned literals are evaluated, never repository or user input.
  return runInNewContext(result.code.replace('export default ', 'result = '), { result: {} })
}

describe('rewritten locale search compatibility', () => {
  it('uses separate lazy imports only in production and preserves native locales', async () => {
    const plugin = rewrittenLocaleSearch()
    const configure = plugin.configResolved
    if (typeof configure !== 'function') throw new Error('Expected config hook')
    const rewrite = plugin.transform as typeof transform
    await configure({ command: 'build', base: '/project/' } as Parameters<typeof configure>[0])
    const result = rewrite(
      `export default {root: () => import('@localSearchIndexroot'), zh: () => import('@localSearchIndexzh')}`,
      '/@localSearchIndex',
    )!
    expect(result.code).toContain("import('virtual:adaptive-search-root')")
    expect(result.code).toContain("import('virtual:adaptive-search-zh')")
    expect(result.code).toContain("zh: () => import('@localSearchIndexzh')")
    expect(result.code).not.toContain("import('@localSearchIndexroot')")
  })

  it('splits and vacuums indexes without losing stored titles or base-relative IDs', async () => {
    const options = { fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'] }
    for (const base of ['/', '/project/', '/zh/project/']) {
      const index = new MiniSearch(options)
      index.addAll([
        { id: `${base}docs/api#api`, title: 'API', titles: [], text: 'englishonly common' },
        { id: `${base}zh/docs/api#api`, title: '接口', titles: [], text: 'chineseonly common' },
      ])
      for (const locale of ['root', 'zh'] as const) {
        const json = await localeSearchIndex(JSON.stringify(index), locale, base)
        const split = MiniSearch.loadJSON(json, options)
        expect(split.documentCount).toBe(1)
        expect(split.search('common')[0]).toMatchObject({
          id: `${base}${locale === 'zh' ? 'zh/' : ''}docs/api#api`,
          title: locale === 'zh' ? '接口' : 'API',
        })
        expect(json).not.toContain(locale === 'zh' ? 'englishonly' : 'chineseonly')
      }
    }
  })

  it('supports an empty locale without leaking documents from the other language', async () => {
    const options = { fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'] }
    const index = new MiniSearch(options)
    for (const populated of [false, true]) {
      if (populated)
        index.add({ id: '/docs/api#api', title: 'API', titles: [], text: 'onlyenglish' })
      const json = await localeSearchIndex(JSON.stringify(index), 'zh', '/')
      const split = MiniSearch.loadJSON(json, options)
      expect(split.documentCount).toBe(0)
      expect(split.search('onlyenglish')).toEqual([])
      expect(json).not.toContain('onlyenglish')
    }
    await expect(localeSearchIndex('invalid JSON', 'root', '/')).rejects.toThrow()
  })

  it('shares the root loader without eagerly loading its index', () => {
    const indexes = evaluate('{ root: () => "shared" }')
    expect(indexes.zh).toBe(indexes.root)
    expect(indexes.zh!()).toBe('shared')
  })

  it('preserves a native Chinese index and other locales', () => {
    const indexes = evaluate('{ root: () => "en", zh: () => "zh", fr: () => "fr" }')
    expect(indexes.zh!()).toBe('zh')
    expect(indexes.root!()).toBe('en')
    expect(indexes.fr!()).toBe('fr')
  })

  it('fails explicitly when neither compatible loader exists', () => {
    for (const expression of ['{}', '{ root: null }', '{ root: {}, zh: false }']) {
      expect(() => evaluate(expression)).toThrow('no Chinese or root index loader')
    }
  })

  it('ignores unrelated modules and rejects an unexpected module format', () => {
    expect(transform('export default {}', '/@localSearchIndexroot')).toBeUndefined()
    expect(() => transform('const indexes = {}', '/@localSearchIndex')).toThrow(
      'Unexpected VitePress search index module',
    )
  })
})
