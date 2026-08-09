import { describe, expect, it } from 'vitest'
import { convertLength, round } from '../src/core/convert.js'
import { createPropertyMatcher, matchesFile, matchesPattern } from '../src/core/matchers.js'
import { resolveOptions } from '../src/core/options.js'

describe('configuration validation', () => {
  it('rejects missing profiles and invalid numeric ranges', () => {
    expect(() => resolveOptions({ defaultProfile: 'missing' })).toThrow(
      'defaultProfile "missing" does not exist',
    )
    expect(() =>
      resolveOptions({
        defaultProfile: 'bad',
        profiles: {
          bad: { designWidth: 0, fluid: { minWidth: 500, maxWidth: 100 } },
        },
      }),
    ).toThrow('fluid.minWidth')
    expect(() => resolveOptions({ precision: 13 })).toThrow('precision')
    expect(() => resolveOptions({ fontFluidity: -1 })).toThrow('fontFluidity')
    expect(() => resolveOptions({ propList: [] })).toThrow('propList')
  })

  it('rejects a unit that is not a scaling unit', () => {
    // The one option where a typo yields *invalid* CSS rather than wrong CSS:
    // `4.267vm` is not a length, so the browser drops the declaration and the
    // element silently keeps whatever it inherited.
    expect(() => resolveOptions({ unit: 'vm' as never })).toThrow(
      /unit "vm" is not a scaling unit.*vw, vi, cqw, cqi/s,
    )
    expect(() =>
      resolveOptions({
        profiles: { app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, unit: 'px' as never } },
      }),
    ).toThrow(/Profile "app" unit "px"/)
    expect(() => resolveOptions({ unit: 'cqi' })).not.toThrow()
  })

  it('rejects an unknown strategy instead of quietly using clamp', () => {
    expect(() => resolveOptions({ strategy: 'viewpoint' as never })).toThrow(
      /strategy "viewpoint" is unknown.*clamp, viewport/s,
    )
    expect(() => resolveOptions({ strategy: 'viewport' })).not.toThrow()
  })

  it('rejects an empty unitToConvert, which would match no length at all', () => {
    expect(() => resolveOptions({ unitToConvert: '' })).toThrow(/unitToConvert cannot be empty/)
  })

  it('rejects an atRuleName that CSS already defines', () => {
    // Taking over `@media` would make every media block in the stylesheet read
    // as naming a canvas. At-keywords are case-insensitive, so `MEDIA` is the
    // same collision.
    expect(() => resolveOptions({ atRuleName: 'media' })).toThrow(/is a CSS at-rule/)
    expect(() => resolveOptions({ atRuleName: 'MEDIA' })).toThrow(/is a CSS at-rule/)
    expect(() => resolveOptions({ atRuleName: 'container' })).toThrow(/is a CSS at-rule/)
    expect(() => resolveOptions({ atRuleName: '' })).toThrow(/atRuleName cannot be empty/)
    expect(() => resolveOptions({ atRuleName: 'canvas' })).not.toThrow()
  })

  it('rejects an empty root.selector, which compiles to an invalid :where()', () => {
    // `:where()` with nothing inside is a parse error, so the whole foundation
    // is discarded — safe-area variables and root cap included.
    expect(() => resolveOptions({ root: { selector: '' } })).toThrow(/root.selector cannot be empty/)
    expect(() => resolveOptions({ root: { selector: '   ' } })).toThrow(/root.selector cannot be empty/)
    expect(() => resolveOptions({ root: { selector: '#app' } })).not.toThrow()
  })

  it('rejects an invalid dynamic design width at conversion time', () => {
    const options = resolveOptions({
      defaultProfile: 'dynamic',
      profiles: {
        dynamic: {
          designWidth: () => Number.NaN,
          fluid: { minWidth: 320, maxWidth: 480 },
        },
      },
    })
    expect(() =>
      convertLength(10, 'width', 'dynamic', options.profiles.dynamic!, options, ''),
    ).toThrow('invalid designWidth')
  })
})

describe('matchers and math helpers', () => {
  it('matches legacy-compatible property globs', () => {
    const match = createPropertyMatcher(['*', '!margin-*', '!font'])
    expect(match('width')).toBe(true)
    expect(match('margin-left')).toBe(false)
    expect(match('font')).toBe(false)
  })

  it('supports reusable regexes, strings, arrays, and functions', () => {
    const global = /src/g
    expect(matchesPattern(global, '/src/a.css')).toBe(true)
    expect(matchesPattern(global, '/src/b.css')).toBe(true)
    expect(matchesFile(['vendor', (file) => file.endsWith('.module.css')], '/a.module.css')).toBe(true)
    expect(matchesFile(undefined, '/src/a.css')).toBe(false)
  })

  it('rounds without negative zero and leaves zero/small values alone', () => {
    expect(round(-0.00001, 2)).toBe(0)
    const options = resolveOptions({ minPixelValue: 2, hairline: 0 })
    const profile = options.profiles.app!
    expect(convertLength(0, 'width', 'app', profile, options, '')).toBe('0px')
    expect(convertLength(1, 'width', 'app', profile, options, '')).toBe('1px')
  })
})
