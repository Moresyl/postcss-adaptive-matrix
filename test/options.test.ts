import { describe, expect, it } from 'vitest'
import { convertLength, createConverter, round } from '../src/core/convert.js'
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

  it('rejects non-finite thresholds before they can leak into generated CSS', () => {
    expect(() => resolveOptions({ fontFluidity: Number.NaN })).toThrow(/fontFluidity/)
    expect(() => resolveOptions({ minPixelValue: Number.NaN })).toThrow(/minPixelValue/)
    expect(() => resolveOptions({ hairline: Number.POSITIVE_INFINITY })).toThrow(/hairline/)
    expect(() =>
      resolveOptions({
        profiles: {
          app: {
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            fontFluidity: Number.NaN,
          },
        },
      }),
    ).toThrow(/Profile "app" fontFluidity/)
    expect(() =>
      resolveOptions({
        profiles: {
          app: {
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            rootMaxWidth: Number.POSITIVE_INFINITY,
          },
        },
      }),
    ).toThrow(/positive rootMaxWidth/)
  })

  it('reports malformed JavaScript and JSON shapes at the option that owns them', () => {
    expect(() => resolveOptions(null as never)).toThrow(/Options must be an object, not null/)
    expect(() => resolveOptions({ profiles: [] as never })).toThrow(/profiles must be an object/)
    expect(() => resolveOptions({ routes: {} as never })).toThrow(
      /routes must be an array, not object/,
    )
    expect(() => resolveOptions({ propList: 'width' as never })).toThrow(
      /propList must be an array, not string/,
    )
    expect(() => resolveOptions({ textProperties: 'font-size' as never })).toThrow(
      /textProperties must be an array, not string/,
    )
    expect(() => resolveOptions({ selectorExclude: '.fixed' as never })).toThrow(
      /selectorExclude must be an array, not string/,
    )
    expect(() => resolveOptions({ routes: [{}] as never })).toThrow(/routes\[0\]\.profile/)
    expect(() =>
      resolveOptions({ routes: [{ profile: 'app', media: { width: 320 } }] as never }),
    ).toThrow(/routes\[0\]\.media\[0\]\.width/)
  })

  it.each([
    [{ minPixeValue: 2 }, /options\.minPixeValue.*Did you mean "minPixelValue"/],
    [
      {
        profiles: {
          app: {
            designWidht: 375,
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
          },
        },
      },
      /profiles\["app"\]\.designWidht.*Did you mean "designWidth"/,
    ],
    [
      {
        profiles: {
          app: { designWidth: 375, fluid: { minWdth: 320, minWidth: 320, maxWidth: 480 } },
        },
      },
      /profiles\["app"\]\.fluid\.minWdth.*Did you mean "minWidth"/,
    ],
    [
      {
        profiles: {
          app: {
            designWidth: 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            query: { condition: '(width > 1px)', conditon: '(width > 2px)' },
          },
        },
      },
      /profiles\["app"\]\.query\.conditon.*Did you mean "condition"/,
    ],
    [
      { routes: [{ profile: 'app', selector: '.a', selectr: '.b' }] },
      /routes\[0\]\.selectr.*Did you mean "selector"/,
    ],
    [
      { routes: [{ profile: 'app', media: { minWidth: 320, maxWidht: 480 } }] },
      /routes\[0\]\.media\[0\]\.maxWidht.*Did you mean "maxWidth"/,
    ],
    [
      { root: { selector: '#app', containerNme: 'page' } },
      /root\.containerNme.*Did you mean "containerName"/,
    ],
  ] as const)('rejects a misspelled configuration field %#', (input, message) => {
    expect(() => resolveOptions(input as never)).toThrow(message)
  })

  it('does not invent a suggestion for an unrelated unknown field', () => {
    expect(() => resolveOptions({ banana: true } as never)).toThrow(
      /options\.banana is not a supported configuration field\.$/,
    )
  })

  it.each([
    [{ textProperties: [16] }, /textProperties\[0\].*must be a string/],
    [{ propList: [' '] }, /propList\[0\] cannot be empty/],
    [{ selectorExclude: [16] }, /selectorExclude\[0\].*string or regular expression/],
    [{ valueExclude: [' '] }, /valueExclude\[0\] cannot be empty/],
    [{ include: [] }, /include cannot be an empty array/],
    [{ exclude: 16 }, /exclude must be a string, regular expression or predicate/],
    [{ include: ' ' }, /include cannot be empty/],
    [{ preserveOriginal: 'yes' }, /preserveOriginal must be a boolean/],
    [{ routes: [/bad/] }, /routes\[0\] must be an object.*regular expression/],
    [{ routes: [{ profile: ' ' }] }, /routes\[0\]\.profile cannot be empty/],
    [{ routes: [{ profile: 'app', selector: [] }] }, /selector cannot be an empty array/],
    [{ routes: [{ profile: 'app', property: [] }] }, /property cannot be an empty array/],
    [{ routes: [{ profile: 'app', property: [' '] }] }, /property\[0\] cannot be empty/],
    [{ routes: [{ profile: 'app', media: [] }] }, /media cannot be an empty array/],
    [{ routes: [{ profile: 'app', media: [16] }] }, /media\[0\] must be an object/],
    [{ routes: [{ profile: 'app' }] }, /routes\[0\] matches nothing/],
    [{ root: { selector: '#app', containerName: 1 } }, /containerName must be a string/],
    [{ root: { selector: '#app', layer: 1 } }, /root\.layer must be a string or false/],
    [{ defaultProfile: 1 }, /defaultProfile must be a non-empty string/],
    [{ atRuleName: 1 }, /atRuleName must be a string/],
  ] as const)('rejects the runtime shape %#', (input, message) => {
    expect(() => resolveOptions(input as never)).toThrow(message)
  })

  it('validates policies, at-rule identifiers and root foundation strings', () => {
    expect(() => resolveOptions({ unknownProfile: 'wat' as never })).toThrow(/unknownProfile/)
    expect(() => resolveOptions({ atRuleName: 'foo bar' })).toThrow(/CSS identifier/)
    expect(() => resolveOptions({ atRuleName: '9adaptive' })).toThrow(/CSS identifier/)
    expect(() => resolveOptions({ root: { selector: '#app', containerName: ' ' } })).toThrow(
      /containerName cannot be empty/,
    )
    expect(() => resolveOptions({ root: { selector: '#app', layer: ' ' } })).toThrow(
      /root\.layer cannot be empty/,
    )
    for (const containerName of ['9page', 'two names', 'inherit', 'none']) {
      expect(() => resolveOptions({ root: { selector: '#app', containerName } })).toThrow(
        /containerName.*valid non-reserved unescaped CSS custom identifier/,
      )
    }
    for (const layer of ['two names', 'framework..layout', 'framework,layout']) {
      expect(() => resolveOptions({ root: { selector: '#app', layer } })).toThrow(
        /one dot-separated CSS layer name/,
      )
    }
    expect(() =>
      resolveOptions({ root: { selector: '#app', layer: 'framework.layout' } }),
    ).not.toThrow()
    expect(() =>
      resolveOptions({ root: { selector: '#app', layer: 'revert-layer' } }),
    ).not.toThrow()
  })

  it('names the profile in every complaint about one', () => {
    // A config with six canvases in it produces six chances to get this wrong,
    // and "requires a positive designWidth" without a name is a search rather
    // than a fix. Each of these is a separate check in `validateProfile`, and
    // each one has to carry the name through.
    const fluid = { minWidth: 320, maxWidth: 480 }
    expect(() => resolveOptions({ profiles: { app: 375 as never } })).toThrow(
      'Profile "app" must be an object',
    )
    expect(() => resolveOptions({ profiles: { app: { designWidth: -375, fluid } } })).toThrow(
      'Profile "app" requires a positive designWidth',
    )
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, fluid, textAnchorWidth: 0 } } }),
    ).toThrow('Profile "app" requires a positive textAnchorWidth')
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, fluid, fontFluidity: 1.5 } } }),
    ).toThrow('Profile "app" fontFluidity must be between 0 and 1')
  })

  it('rejects query shapes that would emit undefined or invalid at-rules', () => {
    const profile = (query: unknown) => ({
      profiles: {
        app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, query } as never,
      },
    })

    expect(() => resolveOptions(profile({ type: 'media' }))).toThrow(/query\.condition/)
    expect(() => resolveOptions(profile({ type: 'viewport', condition: '(width > 1px)' }))).toThrow(
      /query\.type/,
    )
    expect(() => resolveOptions(profile({ condition: '(width > 1px)', name: 'page' }))).toThrow(
      /query\.name only applies to container/,
    )
    expect(() => resolveOptions(profile(' '))).toThrow(/query cannot be an empty string/)
    expect(() => resolveOptions(profile(null))).toThrow(/query must be a string/)
    expect(() =>
      resolveOptions(profile({ type: 'container', name: 'card', condition: '(width > 1px)' })),
    ).not.toThrow()
    expect(() =>
      resolveOptions(profile({ type: 'container', name: ' ', condition: '(width > 1px)' })),
    ).toThrow(/query\.name must be a non-empty string/)
    expect(() =>
      resolveOptions(profile({ type: 'container', name: '9card', condition: '(width > 1px)' })),
    ).toThrow(/query\.name.*valid non-reserved unescaped CSS custom identifier/)
    expect(() =>
      resolveOptions(profile({ type: 'container', name: 'initial', condition: '(width > 1px)' })),
    ).toThrow(/query\.name.*valid non-reserved unescaped CSS custom identifier/)
  })

  it('rejects malformed profile containers and blank profile names', () => {
    const valid = { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } }
    expect(() => resolveOptions({ profiles: { app: { ...valid, fluid: null as never } } })).toThrow(
      /Profile "app" fluid must be an object/,
    )
    expect(() => resolveOptions({ profiles: { app: valid, '': valid } })).toThrow(
      /Profile names cannot be empty/,
    )
  })

  it('rejects an unknown route target during option resolution', () => {
    expect(() => resolveOptions({ routes: [{ profile: 'ghost', selector: '.ghost' }] })).toThrow(
      /routes\[0\]\.profile targets unknown profile "ghost"/,
    )
  })

  it('accepts a design width computed per file, since that is not a number to range-check', () => {
    // `designWidth` may be a function of the file being compiled, so the
    // positivity check has to step aside rather than reject the callback.
    expect(() =>
      resolveOptions({
        profiles: {
          app: {
            designWidth: () => 375,
            fluid: { minWidth: 320, maxWidth: 480 },
            textAnchorWidth: () => 375,
          },
        },
      }),
    ).not.toThrow()
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
        profiles: {
          app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, unit: 'px' as never },
        },
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

  it('reports invalid runtime unit types as configuration errors', () => {
    expect(() => resolveOptions({ unitToConvert: 16 as never })).toThrow(
      /unitToConvert must be a unit string or an array of unit strings/,
    )
    expect(() => resolveOptions({ unitToConvert: ['px', 16] as never })).toThrow(
      /unitToConvert\[1\] must be a unit string, not number/,
    )
    for (const unit of ['%', 'px|rem', 'two words']) {
      expect(() => resolveOptions({ unitToConvert: unit })).toThrow(
        /not a valid unescaped CSS unit identifier/,
      )
    }
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
    expect(resolveOptions({ atRuleName: ' Canvas ' }).atRuleName).toBe('canvas')
  })

  it('rejects an empty root.selector, which compiles to an invalid :where()', () => {
    // `:where()` with nothing inside is a parse error, so the whole foundation
    // is discarded — safe-area variables and root cap included.
    expect(() => resolveOptions({ root: { selector: '' } })).toThrow(
      /root.selector cannot be empty/,
    )
    expect(() => resolveOptions({ root: { selector: '   ' } })).toThrow(
      /root.selector cannot be empty/,
    )
    expect(() => resolveOptions({ root: { selector: '#app' } })).not.toThrow()
    expect(() => resolveOptions({ root: true as never })).toThrow(
      /root must be false or an options object/,
    )
    expect(() => resolveOptions({ root: {} as never })).toThrow(/root\.selector must be a string/)
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

  it('keeps memoised values isolated when profile names and values contain spaces', () => {
    // These two tuples had the same old space-joined key:
    //   ['a', 10, 20, true, '0 16px']
    //   ['a 10', 20, 1, false, '16px']
    // A custom text token compiled first could therefore poison a later width
    // with a leading zero and the wrong canvas formula.
    const options = resolveOptions({
      defaultProfile: 'a',
      libraries: false,
      profiles: {
        a: { designWidth: 10, textAnchorWidth: 20, fluid: { minWidth: 10, maxWidth: 30 } },
        'a 10': { designWidth: 20, textAnchorWidth: 1, fluid: { minWidth: 10, maxWidth: 30 } },
      },
    })
    const converter = createConverter(options)
    converter.convert('0 16px', '--text-x', 'a', options.profiles.a!, '/app.css')

    expect(converter.convert('16px', 'width', 'a 10', options.profiles['a 10']!, '/app.css')).toBe(
      'clamp(8px, 80vw, 24px)',
    )
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
    expect(() => convertLength(10, 'font-size', 'a', options.profiles.a!, options, '')).toThrow(
      'invalid textAnchorWidth',
    )
  })
})

describe('matchers and math helpers', () => {
  it('matches legacy-compatible property globs', () => {
    const match = createPropertyMatcher(['*', '!margin-*', '!font'])
    expect(match('width')).toBe(true)
    expect(match('margin-left')).toBe(false)
    expect(match('font')).toBe(false)
    expect(match('MARGIN-LEFT')).toBe(false)

    const custom = createPropertyMatcher(['--Theme-*'])
    expect(custom('--Theme-gap')).toBe(true)
    expect(custom('--theme-gap')).toBe(false)
  })

  it('supports reusable regexes, strings, arrays, and functions', () => {
    const global = /src/g
    expect(matchesPattern(global, '/src/a.css')).toBe(true)
    expect(matchesPattern(global, '/src/b.css')).toBe(true)
    expect(matchesFile(['vendor', (file) => file.endsWith('.module.css')], '/a.module.css')).toBe(
      true,
    )
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
