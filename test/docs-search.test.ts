import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { rewrittenLocaleSearch } from '../docs/.vitepress/search.js'

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
