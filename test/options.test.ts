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
    expect(() => resolveOptions({ unitToConvert: [] })).toThrow(/unitToConvert cannot be empty/)
    // A list assembled from configuration can carry blanks; only a list that
    // ends up with nothing in it is unusable.
    expect(() => resolveOptions({ unitToConvert: ['  ', ''] })).toThrow(
      /unitToConvert cannot be empty/,
    )
  })

  it('normalises unitToConvert to a deduplicated, longest-first list', () => {
    expect(resolveOptions({ unitToConvert: 'px' }).unitToConvert).toEqual(['px'])
    expect(resolveOptions({ unitToConvert: [' px ', 'rem'] }).unitToConvert).toEqual(['rem', 'px'])
    // Matching is case-insensitive, so `PX` is not a second unit to scan for.
    expect(resolveOptions({ unitToConvert: ['px', 'PX', ''] }).unitToConvert).toEqual(['px'])
  })

  it('rejects a rootValue that cannot be a font size', () => {
    expect(() => resolveOptions({ rootValue: 0 })).toThrow(/rootValue must be a positive number/)
    expect(() => resolveOptions({ rootValue: -16 })).toThrow(/rootValue must be a positive number/)
    expect(() => resolveOptions({ rootValue: Number.NaN })).toThrow(
      /rootValue must be a positive number/,
    )
    expect(() => resolveOptions({ rootValue: 10 })).not.toThrow()
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

  it('rejects a textAnchorWidth that is not a positive width', () => {
    const withAnchor = (textAnchorWidth: unknown) =>
      resolveOptions({
        defaultProfile: 'a',
        profiles: {
          a: {
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            textAnchorWidth: textAnchorWidth as never,
          },
        },
      })
    expect(() => withAnchor(0)).toThrow(/positive textAnchorWidth/)
    expect(() => withAnchor(-750)).toThrow(/positive textAnchorWidth/)
    expect(() => withAnchor(Number.NaN)).toThrow(/positive textAnchorWidth/)
    expect(() => withAnchor(750)).not.toThrow()
    expect(() => withAnchor(undefined)).not.toThrow()

    // A function is only knowable per file, so it is checked where it is called.
    const options = withAnchor(() => 0)
    expect(() =>
      convertLength(10, 'font-size', 'a', options.profiles.a!, options, ''),
    ).toThrow('invalid textAnchorWidth')
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
