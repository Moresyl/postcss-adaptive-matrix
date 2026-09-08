import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { CUSTOM_PROPERTY_CORPUS } from '../bench/corpus.js'
import adaptiveMatrix, { BUILT_IN_LIBRARIES } from '../src/index.js'
import { evaluateLength } from '../src/core/evaluate.js'
import { resolveOptions } from '../src/core/options.js'

describe('cache-churn benchmark workload', () => {
  it.each([false, [...BUILT_IN_LIBRARIES]] as const)(
    'converts all distinct tokens with libraries %j',
    async (libraries) => {
      const options = {
        libraries,
        transformCustomProperties: CUSTOM_PROPERTY_CORPUS.transformCustomProperties,
      }
      const plugin = adaptiveMatrix(options)
      const processor = postcss([plugin])
      const output = await processor.process(CUSTOM_PROPERTY_CORPUS.css, { from: 'tokens.css' })
      expect(output.warnings()).toHaveLength(0)
      const names = new Set<string>()
      const resolved = resolveOptions(options)
      const width = resolved.profiles[resolved.defaultProfile]!.designWidth
      expect(typeof width).toBe('number')
      output.root.walkDecls((declaration) => {
        const index = Number(declaration.prop.slice('--generated-'.length))
        expect(declaration.prop).toMatch(/^--generated-\d+$/)
        expect(declaration.value).not.toBe(`${12 + (index % 100)}px`)
        expect(
          evaluateLength(declaration.value, {
            width: width as number,
            height: 800,
            rootFontSize: 16,
          }),
        ).toBeCloseTo(12 + (index % 100), 2)
        names.add(declaration.prop)
      })
      expect(names.size).toBe(4000)
      const again = await processor.process(output.css, { from: 'tokens.css' })
      expect(again.css).toBe(output.css)
      expect(again.warnings()).toHaveLength(0)
    },
  )
})
