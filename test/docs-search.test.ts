import { describe, expect, it } from 'vitest'
import { rewrittenLocaleSearch } from '../docs/.vitepress/search.js'

function transform(code: string, id = '/@localSearchIndex') {
  const hook = rewrittenLocaleSearch().transform as CallableFunction
  return hook(code, id) as { code: string; map: null } | undefined
}

describe('rewritten documentation locale search', () => {
  it('makes the shared index available to Chinese clients', () => {
    const result = transform('export default { root: () => "shared" }')!
    expect(result.code).toContain('zh: indexes.zh ?? indexes.root')
  })

  it('preserves independent locale indexes when available', () => {
    const result = transform(
      'export default { root: () => "english", zh: () => "chinese", fr: () => "french" };',
    )!
    expect(result.code).toContain('zh: indexes.zh ?? indexes.root')
    expect(result.code).toContain('zh: () => "chinese"')
  })

  it('does not transform index data or unrelated modules', () => {
    expect(transform('export default "data"', '/@localSearchIndexroot')).toBeUndefined()
    expect(transform('export default {}', '/other.ts')).toBeUndefined()
  })

  it('fails explicitly if the upstream module contract changes', () => {
    expect(() => transform('const indexes = {}; export { indexes as default }')).toThrow(
      'review locale compatibility',
    )
  })
})
