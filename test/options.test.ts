import { describe, expect, it, vi } from 'vitest'
import { convertLength, convertValue, createConverter, round } from '../src/core/convert.js'
import { createPropertyMatcher, matchesFile, matchesPattern } from '../src/core/matchers.js'
import { resolveOptions } from '../src/core/options.js'

it('reports missing route array entries at their exact indexes', () => {
  for (const missingIndex of [0, 1]) {
    const routes: Array<{ profile: string; selector: string }> = new Array(2)
    routes[missingIndex === 0 ? 1 : 0] = { profile: 'app', selector: '.card' }
    expect(() => resolveOptions({ routes })).toThrow(
      `routes[${missingIndex}] must be an object, not undefined.`,
    )
  }
})

it('converts oversized values without retaining them in the value cache', () => {
  const options = resolveOptions({ profiles: { app: 375 } })
  const converter = createConverter(options)
  const convert = (value: string) =>
    converter.convertWithMetadata(value, 'width', 'app', options.profiles.app!, '')
  const small = convert('24px')
  expect(convert('24px')).toBe(small)
  const value = `custom("${'x'.repeat(16_384)}", 24px)`
  const first = convert(value)
  const second = convert(value)
  expect(second).toEqual(first)
  expect(second).not.toBe(first)
  expect(first.value).toContain('calc(6.4vw)')
  expect(convert('24px')).toBe(small)
})

it('evicts cached strings on aggregate size before the entry-count limit', () => {
  const options = resolveOptions({ profiles: { app: 375 } })
  const converter = createConverter(options)
  const convert = (value: string) =>
    converter.convertWithMetadata(value, 'width', 'app', options.profiles.app!, '')
  const first = convert('24px')
  const padding = 'x'.repeat(8_000)
  for (let index = 0; index < 300; index++) convert(`custom("${padding}${index}", 24px)`)
  const renewed = convert('24px')
  expect(renewed).toEqual(first)
  expect(renewed).not.toBe(first)
  expect(convert('24px')).toBe(renewed)
})

it('does not retain a small input whose converted output exceeds the cache value limit', () => {
  const options = resolveOptions({ profiles: { app: 375 } })
  const converter = createConverter(options)
  const value = Array.from({ length: 2_000 }, () => '24px').join(' ')
  expect(value.length).toBeLessThan(16_384)
  const convert = () =>
    converter.convertWithMetadata(value, 'margin', 'app', options.profiles.app!, '')
  const first = convert()
  expect(first.value.length).toBeGreaterThan(16_384)
  expect(first.value).toBe(Array.from({ length: 2_000 }, () => 'calc(6.4vw)').join(' '))
  const second = convert()
  expect(second).toEqual(first)
  expect(second).not.toBe(first)
})

it('prepares escaped text patterns once for a reusable converter', () => {
  const options = resolveOptions({
    profiles: { app: 375 },
    textProperties: [String.raw`F\4f NT-SIZE`, '--Theme-*'],
  })
  const converter = createConverter(options)
  for (const property of ['font-size', 'FONT-SIZE', '--Theme-large']) {
    expect(converter.convert('24px', property, 'app', options.profiles.app!, '')).toContain('rem')
  }
  expect(
    converter.convert('24px', '--theme-large', 'app', options.profiles.app!, ''),
  ).not.toContain('rem')
})

it('does not retain oversized property classification keys', () => {
  const options = resolveOptions({ profiles: { app: 375 }, textProperties: ['--text-*'] })
  const converter = createConverter(options)
  const classifications = vi.spyOn(Map.prototype, 'set')
  try {
    for (const length of [256, 257, 10000]) {
      classifications.mockClear()
      const property = '--text-' + 'a'.repeat(length - 7)
      const first = converter.convert('24px', property, 'app', options.profiles.app!, '')
      expect(converter.convert('24px', property, 'app', options.profiles.app!, '')).toBe(first)
      expect(first).toContain('rem')
      expect(classifications.mock.calls.filter(([key]) => key === property)).toHaveLength(
        length <= 256 ? 1 : 0,
      )
    }
  } finally {
    classifications.mockRestore()
  }
})

it('bounds property classification caching and reclassifies evicted entries correctly', () => {
  const options = resolveOptions({ profiles: { app: 375 } })
  const converter = createConverter(options)
  const profile = options.profiles.app!
  const classifications = vi.spyOn(Map.prototype, 'set')
  try {
    const expected = converter.convert('24px', 'font-size', 'app', profile, '')
    expect(converter.convert('24px', 'font-size', 'app', profile, '')).toBe(expected)
    expect(classifications.mock.calls.filter(([key]) => key === 'font-size')).toHaveLength(1)
    for (let index = 0; index < 20_000; index++) {
      converter.convert('24px', `--generated-${index}`, 'app', profile, '')
    }
    expect(converter.convert('24px', 'font-size', 'app', profile, '')).toBe(expected)
    expect(classifications.mock.calls.filter(([key]) => key === 'font-size')).toHaveLength(2)
  } finally {
    classifications.mockRestore()
  }
})

describe('configuration validation', () => {
  it('locates invalid numeric media bands inside route arrays', () => {
    for (const [band, expected] of [
      [{ minWidth: -1 }, 'routes[1].media[1].minWidth'],
      [{ maxWidth: Infinity }, 'routes[1].media[1].maxWidth'],
      [{}, 'routes[1].media[1] needs'],
      [{ minWidth: 600, maxWidth: 320 }, 'routes[1].media[1] band'],
    ] as const) {
      expect(() =>
        resolveOptions({
          routes: [
            { profile: 'app', selector: '.first' },
            { profile: 'app', media: [{ minWidth: 0 }, band] },
          ],
        }),
      ).toThrow(expected)
    }
    expect(() => resolveOptions({ routes: { profile: 'app', media: { minWidth: -1 } } })).toThrow(
      'routes.media.minWidth',
    )
  })

  it('alternates simple and complex values without leaking unit-pattern state', () => {
    const options = resolveOptions({
      profiles: { app: 400 },
      strategy: 'viewport',
      libraries: false,
    })
    const converter = createConverter(options)
    const cases = [
      ['40px', '10vw'],
      ['+40px', '10vw'],
      ['.4px', '.4px'],
      ['-.4px', '-.4px'],
      ['4.5px', '1.125vw'],
      [' 80px ', ' 20vw '],
      ['"120px"', '"120px"'],
      ['url(160px.svg)', 'url(160px.svg)'],
      ['calc(100vw - 200px)', 'calc(100vw - 50vw)'],
      [String.raw`240p\78`, '60vw'],
      ['min(280px, 50vw)', 'min(280px, 50vw)'],
      ['320px 360px', '80vw 90vw'],
      ['400px', '100vw'],
    ] as const
    for (let pass = 0; pass < 2; pass++) {
      converter.beginFile()
      for (const [value, expected] of cases) {
        expect(converter.convert(value, 'width', 'app', options.profiles.app!, '')).toBe(expected)
      }
    }
  })

  it.each(['24px', '-24px', '1e2px', '1rem', '1px', '0px', '1e309px', '24PX'])(
    'matches the parsed path for a single dimension %s',
    (value) => {
      for (const strategy of ['viewport', 'clamp'] as const) {
        const options = resolveOptions({
          profiles: { app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 600 } } },
          unitToConvert: ['px', 'rem'],
          strategy,
        })
        for (const property of ['width', 'font-size']) {
          const converter = createConverter(options)
          const fast = converter.convertWithMetadata(
            value,
            property,
            'app',
            options.profiles.app!,
            '',
          )
          const parsed = converter.convertWithMetadata(
            `${value} `,
            property,
            'app',
            options.profiles.app!,
            '',
          )
          expect(fast).toEqual({ ...parsed, value: parsed.value.trimEnd() })
        }
      }
    },
  )

  it('retains converter unit patterns after the shared pattern cache is cleared', () => {
    const options = resolveOptions({ profiles: { app: 400 }, strategy: 'viewport' })
    const converter = createConverter(options)
    for (let index = 0; index < 300; index++) {
      const custom = resolveOptions({
        profiles: { app: 400 },
        strategy: 'viewport',
        unitToConvert: `custom${index}`,
      })
      expect(
        createConverter(custom).convert(
          `40custom${index}`,
          'width',
          'app',
          custom.profiles.app!,
          '',
        ),
      ).toBe('10vw')
    }
    converter.beginFile()
    expect(converter.convert('80px', 'width', 'app', options.profiles.app!, '')).toBe('20vw')
  })

  it.each([0, 5, 12])('preserves large finite values when rounding to %i places', (precision) => {
    expect(round(1e307, precision)).toBe(1e307)
    expect(round(-1e307, precision)).toBe(-1e307)
    const options = resolveOptions({ profiles: { app: 400 }, strategy: 'viewport', precision })
    expect(convertLength(1e302, 'width', 'app', options.profiles.app!, options, '')).toBe(
      '2.5e+301vw',
    )
  })

  it('rejects overflow in the numeric core helper while preserving authored CSS values', () => {
    const options = resolveOptions({ profiles: { app: 375 }, strategy: 'viewport' })
    const profile = options.profiles.app!
    expect(() => convertLength(1e308, 'width', 'app', profile, options, '')).toThrow(
      /Converted length exceeds the finite numeric range/,
    )
    expect(convertValue('1e308px 24px', 'margin', 'app', profile, options, '')).toBe(
      '1e308px 6.4vw',
    )
    expect(convertLength(24, 'width', 'app', profile, options, '')).toBe('6.4vw')
  })

  it('keeps text classification in viewport mode to protect precompiled hybrid text', () => {
    const options = resolveOptions({
      profiles: { app: 375 },
      strategy: 'viewport',
      unitToConvert: ['px', 'rem'],
      hairline: 0,
    })
    const converter = createConverter(options)
    const profile = options.profiles.app!
    const value = 'calc(1rem + 2vw)'
    expect(converter.convert(value, 'font-size', 'app', profile, '/a.css')).toBe(value)
    expect(converter.convert(value, 'width', 'app', profile, '/a.css')).toBe(
      'calc(4.26667vw + 2vw)',
    )
    converter.beginFile()
    expect(converter.convert(value, 'font-size', 'app', profile, '/b.css')).toBe(value)
  })

  it('treats undefined optional top-level fields as omitted', () => {
    const options = resolveOptions({
      profiles: undefined,
      defaultProfile: undefined,
      routes: undefined,
      libraries: undefined,
      atRuleName: undefined,
      strategy: undefined,
      unit: undefined,
      precision: undefined,
      unitToConvert: undefined,
      rootValue: undefined,
      minPixelValue: undefined,
      hairline: undefined,
      fontFluidity: undefined,
      textProperties: undefined,
      propList: undefined,
      selectorExclude: undefined,
      valueExclude: undefined,
      include: undefined,
      exclude: undefined,
      transformCustomProperties: undefined,
      preserveOriginal: undefined,
      root: undefined,
      unknownProfile: undefined,
    })

    expect(options).toMatchObject({
      defaultProfile: 'app',
      atRuleName: 'adaptive',
      strategy: 'clamp',
      unit: 'vw',
      precision: 5,
      unitToConvert: ['px'],
      rootValue: 16,
      minPixelValue: 0,
      hairline: 1,
      fontFluidity: 0.35,
      transformCustomProperties: false,
      preserveOriginal: false,
      root: false,
      unknownProfile: 'warn',
    })
    expect(options.profiles).toHaveProperty('app')
    expect(options.libraries.length).toBeGreaterThan(0)
  })

  it('treats an empty optional profile map as omitted', () => {
    const options = resolveOptions({ profiles: {} })

    expect(options.defaultProfile).toBe('app')
    expect(options.profiles).toHaveProperty('app')
    expect(options.profiles).toHaveProperty('pc')
  })

  it.each([{}, { profiles: {} }])('isolates default configuration graphs: %j', (input) => {
    const baseline = resolveOptions(input)
    const changed = resolveOptions(input)
    changed.profiles.app!.designWidth = 999
    changed.profiles.app!.fluid!.minWidth = 123
    changed.profiles.pc!.fluid!.maxWidth = 9999
    changed.routes.length = 0
    changed.libraries.length = 0
    changed.unitToConvert.push('rem')
    changed.textProperties.length = 0
    changed.propList[0] = 'margin'
    changed.selectorExclude.push('.ignored')
    changed.valueExclude.push('24px')
    expect(resolveOptions(input)).toEqual(baseline)
  })

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

  it('accepts omitted and one-sided fluid bounds while validating supplied values', () => {
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375 } } }).profiles.app!.fluid,
    ).toBeUndefined()
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375, fluid: { minWidth: 320 } } } }).profiles
        .app!.fluid,
    ).toEqual({ minWidth: 320 })
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375, fluid: { maxWidth: 600 } } } }).profiles
        .app!.fluid,
    ).toEqual({ maxWidth: 600 })
    expect(
      resolveOptions({ profiles: { app: { designWidth: 375, fluid: {} } } }).profiles.app!.fluid,
    ).toEqual({})
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, fluid: { minWidth: 0 } } } }),
    ).toThrow(/fluid\.minWidth must be a positive finite number/)
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, fluid: { maxWidth: Infinity } } } }),
    ).toThrow(/fluid\.maxWidth must be a positive finite number/)
  })

  it('rejects a fixed-column correction when no profile creates a column', () => {
    expect(() =>
      resolveOptions({
        profiles: { mobile: 375 },
        root: { fixedContainingBlock: true },
      }),
    ).toThrow(/fixedContainingBlock needs at least one profile with rootMaxWidth/)

    expect(
      resolveOptions({
        profiles: { mobile: { designWidth: 375, rootMaxWidth: 480 } },
        root: { fixedContainingBlock: true },
      }).root,
    ).toMatchObject({ fixedContainingBlock: true })
  })

  it('infers the only authored profile instead of requiring its name twice', () => {
    expect(resolveOptions({ profiles: { mobile: { designWidth: 375 } } }).defaultProfile).toBe(
      'mobile',
    )
    expect(() =>
      resolveOptions({
        profiles: { mobile: { designWidth: 375 }, desktop: { designWidth: 1440 } },
      }),
    ).toThrow(/defaultProfile "app" does not exist/)
  })

  it('treats profile names as own keys rather than object prototype members', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      const options = resolveOptions({ profiles: { [name]: 375 }, libraries: false })
      expect(options.defaultProfile).toBe(name)
      expect(Object.hasOwn(options.profiles, name)).toBe(true)
      expect(options.profiles[name]).toEqual({ designWidth: 375 })
      expect(Object.getPrototypeOf(options.profiles)).toBe(Object.prototype)
    }

    expect(() => resolveOptions({ routes: { profile: 'valueOf', selector: '.legacy' } })).toThrow(
      /targets unknown profile "valueOf"/,
    )
  })

  it('accepts a design width directly when a profile needs no overrides', () => {
    const scalar = resolveOptions({ profiles: { mobile: 375 } })
    expect(scalar.defaultProfile).toBe('mobile')
    expect(scalar.profiles.mobile).toEqual({ designWidth: 375 })

    const dynamic = resolveOptions({ profiles: { mobile: () => 390 } })
    expect(dynamic.profiles.mobile!.designWidth).toBeTypeOf('function')
    expect(() => resolveOptions({ profiles: { mobile: 0 } })).toThrow(
      /Profile "mobile" requires a positive designWidth/,
    )
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
    expect(() => resolveOptions({ defaultProfile: null } as never)).toThrow(
      /defaultProfile must be a non-empty string/,
    )
    expect(() => resolveOptions({ unitToConvert: null } as never)).toThrow(
      /unitToConvert must be a unit string or an array/,
    )
    expect(() => resolveOptions({ routes: 16 as never })).toThrow(/routes must be an object/)
    for (const input of [new Date(), new Map(), Promise.resolve()]) {
      expect(() => resolveOptions(input as never), input.constructor.name).toThrow(
        /Options must be an object/,
      )
    }
    expect(() => resolveOptions({ profiles: new Map() as never })).toThrow(
      /profiles must be an object/,
    )
    expect(() => resolveOptions({ root: new Date() as never })).toThrow(
      /root must be true, false or an options object/,
    )
    expect(() =>
      resolveOptions({ routes: { profile: 'app', media: new Date() as never } }),
    ).toThrow(/routes\.media must be an object/)
    const PretendsToBeObject = { Object: class Object {} }.Object
    expect(() => resolveOptions(new PretendsToBeObject() as never)).toThrow(
      /Options must be an object/,
    )

    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      precision: 4,
    })
    expect(resolveOptions(nullPrototype).precision).toBe(4)
    expect(resolveOptions({ propList: 'width' }).propList).toEqual(['width'])
    expect(resolveOptions({ textProperties: 'font-size' }).textProperties).toEqual(['font-size'])
    expect(resolveOptions({ selectorExclude: '.fixed' }).selectorExclude).toEqual(['.fixed'])
    expect(resolveOptions({ valueExclude: /fixed/ }).valueExclude).toEqual([/fixed/])
    expect(
      resolveOptions({ libraries: false, routes: { profile: 'app', selector: '.a' } }).routes,
    ).toEqual([{ profile: 'app', selector: '.a' }])
    expect(() =>
      resolveOptions({ routes: { profile: 'app', property: /token/ as never } }),
    ).toThrow(/routes\.property received the regular expression/)
    for (const property of ['spacing', '--bad:']) {
      expect(() => resolveOptions({ routes: { profile: 'app', property } })).toThrow(
        /routes\.property must be an unescaped custom-property prefix starting with "--"/,
      )
    }
    expect(resolveOptions({ routes: { profile: 'app', property: '--' } }).routes[0]).toMatchObject({
      property: '--',
    })
    expect(() =>
      resolveOptions({ routes: { profile: 'app', media: { maxWidht: 480 } } as never }),
    ).toThrow(/routes\.media\.maxWidht.*Did you mean "maxWidth"/)
    expect(() => resolveOptions({ routes: [{}] as never })).toThrow(/routes\[0\]\.profile/)
    expect(() =>
      resolveOptions({ routes: [{ profile: 'app', media: { width: 320 } }] as never }),
    ).toThrow(/routes\[0\]\.media\.width/)
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
      /routes\[0\]\.media\.maxWidht.*Did you mean "maxWidth"/,
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
    expect(() => resolveOptions({ profiles: { app: '375' as never } })).toThrow(
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
    expect(() =>
      resolveOptions({
        profiles: { app: { designWidth: 375, textAnchorWidth: null } as never },
      }),
    ).toThrow('Profile "app" requires a positive textAnchorWidth')
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, fontFluidity: null } as never } }),
    ).toThrow('Profile "app" fontFluidity must be between 0 and 1')
    expect(() =>
      resolveOptions({ profiles: { app: { designWidth: 375, rootMaxWidth: null } as never } }),
    ).toThrow('Profile "app" requires a positive rootMaxWidth')
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
    expect(
      resolveOptions(profile({ condition: '(width > 1px)', name: 'page' })).profiles.app!.query,
    ).toEqual({ type: 'container', condition: '(width > 1px)', name: 'page' })
    expect(() =>
      resolveOptions(profile({ type: 'media', condition: '(width > 1px)', name: 'page' })),
    ).toThrow(/query\.name only applies to container/)
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

  it('keeps query conditions inside their generated at-rule boundary', () => {
    const profile = (query: unknown) => ({
      profiles: {
        app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, query } as never,
      },
    })

    expect(() => resolveOptions(profile('(width > 1px) { .escaped'))).toThrow(
      /query contains a "\{".*safely wrapped/,
    )
    expect(() => resolveOptions(profile('(width > 1px); .escaped'))).toThrow(
      /query contains a top-level ";".*safely wrapped/,
    )
    expect(() => resolveOptions(profile('(width > 1px'))).toThrow(/query has an unclosed "\("/)
    expect(() => resolveOptions(profile('(width > 1px) /* open'))).toThrow(
      /query has an unterminated comment/,
    )
    expect(() =>
      resolveOptions(profile({ type: 'container', condition: 'style(--theme: "open)' })),
    ).toThrow(/query\.condition has an unterminated " string/)

    // A semicolon inside a quoted custom-property value is data, not an
    // at-rule terminator. New style-query syntax must not be rejected merely
    // because this guard is intentionally narrower than a full query parser.
    expect(() =>
      resolveOptions(profile({ type: 'container', condition: 'style(--theme: "a;b")' })),
    ).not.toThrow()
  })

  it('keeps the configured root selector inside :where()', () => {
    for (const selector of [
      '#app) { .escaped',
      ':is(#app { .escaped)',
      '#app[open',
      '#app /* open',
      '#app; .escaped',
    ]) {
      expect(() => resolveOptions({ root: { selector } }), selector).toThrow(
        /root\.selector.*safely wrapped in :where/,
      )
    }
    expect(() =>
      resolveOptions({ root: { selector: ':is(#app, [data-shell="wide;main"])' } }),
    ).not.toThrow()
  })

  it('rejects malformed profile containers and blank profile names', () => {
    const valid = { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } }
    expect(() => resolveOptions({ profiles: { app: { ...valid, fluid: null as never } } })).toThrow(
      /Profile "app" fluid must be an object/,
    )
    expect(() => resolveOptions({ profiles: { app: valid, '': valid } })).toThrow(
      /Profile names cannot be empty/,
    )
    expect(() => resolveOptions({ profiles: { ' app ': valid } })).toThrow(
      /Profile name " app ".*surrounding whitespace/,
    )
    expect(() =>
      resolveOptions({ profiles: { 'a 10': valid }, defaultProfile: 'a 10' }),
    ).not.toThrow()
  })

  it('rejects surrounding whitespace on references without banning internal spaces', () => {
    expect(() => resolveOptions({ defaultProfile: ' app ' })).toThrow(
      /defaultProfile cannot have surrounding whitespace/,
    )
    expect(() => resolveOptions({ routes: { profile: ' app ', selector: '.app' } })).toThrow(
      /routes\.profile cannot have surrounding whitespace/,
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

  it('resolves a dynamic design width once when the text anchor is omitted', () => {
    let calls = 0
    const options = resolveOptions({
      libraries: false,
      profiles: { app: { designWidth: () => (++calls === 1 ? 375 : 750) } },
    })
    const profile = options.profiles.app!

    const result = convertLength(16, 'font-size', 'app', profile, options, '/app.css')

    expect(calls).toBe(1)
    expect(result).toContain('1.49333vw')
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
    const resolver = () => 10
    expect(resolveOptions({ rootValue: resolver }).rootValue).toBe(resolver)
  })

  it('does not reuse a conversion cached under another file rootValue', () => {
    let legacyRoot = 10
    const options = resolveOptions({
      unitToConvert: ['rem'],
      rootValue: ({ file }) => (file.includes('legacy') ? legacyRoot : 16),
    })
    const converter = createConverter(options)
    const profile = options.profiles[options.defaultProfile]!

    converter.beginFile()
    const modern = converter.convert(
      '2rem',
      'width',
      options.defaultProfile,
      profile,
      '/modern.css',
    )
    converter.beginFile()
    const legacy = converter.convert(
      '2rem',
      'width',
      options.defaultProfile,
      profile,
      '/legacy.css',
    )
    legacyRoot = 20
    converter.beginFile()
    const rebuilt = converter.convert(
      '2rem',
      'width',
      options.defaultProfile,
      profile,
      '/legacy.css',
    )

    expect(modern).not.toBe(legacy)
    expect(rebuilt).not.toBe(legacy)
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

  it('defaults root.selector while rejecting an authored empty selector', () => {
    // `:where()` with nothing inside is a parse error, so the whole foundation
    // is discarded — safe-area variables and root cap included.
    expect(() => resolveOptions({ root: { selector: '' } })).toThrow(
      /root.selector cannot be empty/,
    )
    expect(() => resolveOptions({ root: { selector: '   ' } })).toThrow(
      /root.selector cannot be empty/,
    )
    expect(() => resolveOptions({ root: { selector: '#app' } })).not.toThrow()
    expect(resolveOptions({ root: true }).root).toEqual({ selector: ':root' })
    expect(resolveOptions({ root: {} }).root).toMatchObject({ selector: ':root' })
    expect(() => resolveOptions({ root: null as never })).toThrow(
      /root must be true, false or an options object/,
    )
    expect(() => resolveOptions({ root: { selector: 1 as never } })).toThrow(
      /root\.selector must be a string/,
    )
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

  it('recognises escaped custom-property names as accessible text tokens', () => {
    const options = resolveOptions({ libraries: false })
    const profile = options.profiles.app!
    const escaped = convertLength(
      16,
      String.raw`--\74 ext-size`,
      'app',
      profile,
      options,
      '/app.css',
    )

    expect(escaped).toBe(convertLength(16, '--text-size', 'app', profile, options, '/app.css'))
    expect(escaped).toContain('rem')
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

describe('convertValue public core API', () => {
  it('uses omitted and one-sided fluid bounds exactly like the PostCSS entry', () => {
    const unbounded = resolveOptions({
      libraries: false,
      hairline: 0,
      profiles: { app: 400 },
    })
    const upperBounded = resolveOptions({
      libraries: false,
      hairline: 0,
      profiles: { app: { designWidth: 400, fluid: { maxWidth: 600 } } },
    })

    expect(convertValue('40px 20px', 'margin', 'app', unbounded.profiles.app!, unbounded, '')).toBe(
      'calc(10vw) calc(5vw)',
    )
    expect(
      convertValue('40px 20px', 'margin', 'app', upperBounded.profiles.app!, upperBounded, ''),
    ).toBe('min(10vw, 60px) min(5vw, 30px)')
  })

  it('resolves file-aware canvas functions and names an invalid result', () => {
    const options = resolveOptions({
      libraries: false,
      hairline: 0,
      profiles: { app: ({ file }) => (file.includes('wide') ? 800 : 400) },
    })

    expect(convertValue('40px', 'width', 'app', options.profiles.app!, options, '/wide.css')).toBe(
      'calc(5vw)',
    )

    const invalid = resolveOptions({
      libraries: false,
      profiles: { app: () => Number.NaN },
    })
    expect(() =>
      convertValue('40px', 'width', 'app', invalid.profiles.app!, invalid, '/broken.css'),
    ).toThrow(/invalid designWidth for "\/broken\.css"/)
  })
})

describe('matchers and math helpers', () => {
  it('preserves property decisions across cache hits and repeated eviction', () => {
    const match = createPropertyMatcher(['width', '--Theme-*', '! --unused', '!--Theme-private*'])
    const cases: [string, boolean][] = [
      ['WIDTH', true],
      [String.raw`w\69 dth`, true],
      ['height', false],
      ['--Theme-gap', true],
      ['--theme-gap', false],
      ['--Theme-private-gap', false],
      [String.raw`--\54 heme-gap`, true],
    ]
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const [property, expected] of cases) expect(match(property)).toBe(expected)
      }
      for (let index = 0; index < 1100; index++) {
        expect(match(`--Theme-generated-${cycle}-${index}`)).toBe(true)
        expect(match(`--other-generated-${cycle}-${index}`)).toBe(false)
      }
    }
    for (const [property, expected] of cases) expect(match(property)).toBe(expected)
  })

  it('matches legacy-compatible property globs', () => {
    const match = createPropertyMatcher(['*', '!margin-*', '!font'])
    expect(match('width')).toBe(true)
    expect(match('margin-left')).toBe(false)
    expect(match('font')).toBe(false)
    expect(match('MARGIN-LEFT')).toBe(false)
    expect(match(String.raw`m\61 rgin-left`)).toBe(false)
    expect(createPropertyMatcher(['Ä-size'])('ä-size')).toBe(false)

    const custom = createPropertyMatcher(['--Theme-*'])
    expect(custom('--Theme-gap')).toBe(true)
    expect(custom('--theme-gap')).toBe(false)
    expect(custom(String.raw`--\54 heme-gap`)).toBe(true)
    expect(custom(String.raw`--\74 heme-gap`)).toBe(false)
  })

  it('collapses adjacent property wildcards while retaining exclusions and case rules', () => {
    const compact = createPropertyMatcher(['*', '!margin-*', '!--Theme-*'])
    const repeated = createPropertyMatcher(['***', '!margin-****', '!--Theme-***'])
    for (const property of ['width', 'MARGIN-LEFT', '--Theme-gap', '--theme-gap', 'padding']) {
      expect(repeated(property)).toBe(compact(property))
    }
    const suffix = createPropertyMatcher([`--${'*'.repeat(1000)}-size`])
    expect(suffix(`--${'a'.repeat(10000)}-gap`)).toBe(false)
    expect(suffix(`--${'a'.repeat(10000)}-size`)).toBe(true)
  })

  it('matches a bounded reference corpus without regex backtracking', () => {
    const words = ['']
    for (let size = 0; size < 4; size++) {
      for (const word of words.filter((value) => value.length === size)) {
        for (const letter of ['a', 'b', '*']) words.push(word + letter)
      }
    }
    const names = words.filter((word) => !word.includes('*'))
    for (const word of words) {
      const pattern = `--${word}`
      const expected = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      const match = createPropertyMatcher([pattern])
      for (const name of names) expect(match(`--${name}`)).toBe(expected.test(`--${name}`))
    }
    const pathological = createPropertyMatcher([`--${'a*'.repeat(1000)}b`])
    expect(pathological(`--${'a'.repeat(10000)}c`)).toBe(false)
    expect(pathological(`--${'a'.repeat(10000)}b`)).toBe(true)
    expect(createPropertyMatcher(['--ab*bc'])('--abc')).toBe(false)
  })

  it('supports reusable regexes, strings, arrays, and functions', () => {
    const global = /src/g
    global.lastIndex = 2
    expect(matchesPattern(global, '/src/a.css')).toBe(true)
    expect(global.lastIndex).toBe(2)
    expect(matchesPattern(global, '/src/b.css')).toBe(true)
    expect(global.lastIndex).toBe(2)
    expect(matchesFile(['vendor', (file) => file.endsWith('.module.css')], '/a.module.css')).toBe(
      true,
    )
    expect(matchesFile([() => false, 'module.css'], '/a.module.css')).toBe(true)
    expect(matchesFile(undefined, '/src/a.css')).toBe(false)
  })

  it('preserves non-stateful regex cursors and restores custom execution after errors', () => {
    const ordinary = /src/i
    ordinary.lastIndex = 7
    expect(matchesPattern(ordinary, 'SRC/card.css')).toBe(true)
    expect(matchesPattern(ordinary, 'other.css')).toBe(false)
    expect(ordinary.lastIndex).toBe(7)
    const custom = /src/
    custom.lastIndex = 9
    custom.exec = () => {
      expect(custom.lastIndex).toBe(0)
      custom.lastIndex = 42
      throw new Error('custom matcher failed')
    }
    expect(() => matchesFile(custom, 'src/card.css')).toThrow('custom matcher failed')
    expect(custom.lastIndex).toBe(9)
  })

  it.each(['', 'g', 'y'])('supports frozen %s regex configuration without mutation', (flags) => {
    const pattern = new RegExp('src', flags)
    pattern.lastIndex = 2
    Object.freeze(pattern)
    expect(matchesPattern(pattern, 'src/card.css')).toBe(true)
    expect(matchesFile(pattern, 'src/card.css')).toBe(true)
    expect(matchesPattern(pattern, 'other/card.css')).toBe(false)
    expect(pattern.lastIndex).toBe(2)
  })

  it('matches string paths across Windows and POSIX separators without rewriting predicates', () => {
    const windows = String.raw`C:\repo\src\components\card.css`
    let observed = ''

    expect(matchesFile('src/components/', windows)).toBe(true)
    expect(matchesFile('src\\components\\', '/repo/src/components/card.css')).toBe(true)
    expect(
      matchesFile((file) => {
        observed = file
        return false
      }, windows),
    ).toBe(false)
    expect(observed).toBe(windows)
  })

  it('rounds without negative zero and leaves zero/small values alone', () => {
    expect(round(-0.00001, 2)).toBe(0)
    const options = resolveOptions({ minPixelValue: 2, hairline: 0 })
    const profile = options.profiles.app!
    expect(convertLength(0, 'width', 'app', profile, options, '')).toBe('0px')
    expect(convertLength(1, 'width', 'app', profile, options, '')).toBe('1px')
    // The threshold is the minimum value that converts, not another hairline:
    // `hairline` owns the inclusive "at or below" contract beside it.
    expect(convertLength(2, 'width', 'app', profile, options, '')).not.toBe('2px')
    expect(() =>
      convertLength(Number.POSITIVE_INFINITY, 'width', 'app', profile, options, ''),
    ).toThrow(/Length value must be a finite number/)
    expect(() => convertLength(Number.NaN, 'width', 'app', profile, options, '')).toThrow(
      /Length value must be a finite number/,
    )
  })
})
