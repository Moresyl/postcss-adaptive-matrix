import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix from '../src/index.js'
import { findContinuityIssues } from '../src/core/continuity.js'
import { evaluateLength, splitComponents } from '../src/core/evaluate.js'

const AT = { width: 768, height: 800, rootFontSize: 16 }
const px = (value: string, width = AT.width) => evaluateLength(value, { ...AT, width })

it.each([
  '.a { width: 10vw } @media (min-width: 768px) { .a { width: 5vw } }',
  ':root { --gap: 10vw } @media (min-width: 768px) { :root { --gap: 5vw } } .a { width: var(--gap) }',
])('recognizes escaped media names supplied by an AST producer in %s', (css) => {
  const expected = findContinuityIssues(postcss.parse(css))
  expect(expected).toHaveLength(1)
  const root = postcss.parse(css)
  root.walkAtRules('media', (atRule) => {
    atRule.name = String.raw`m\65 dia`
  })
  expect(findContinuityIssues(root)).toEqual(expected)
})

it.each(['\n', '\r\n', '\f'])(
  'does not report valid-looking fragments around an invalid escaped newline %j',
  (newline) => {
    const root = postcss.parse(
      `.a { margin: 10vw \\${newline} 20vw; }
       @media (min-width: 768px) { .a { margin: 5vw \\${newline} 10vw; } }
       .valid { width: 10vw; }
       @media (min-width: 768px) { .valid { width: 5vw; } }`,
    )
    const issues = findContinuityIssues(root)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.selector).toBe('.valid')
  },
)

it.each([
  [String.raw`c\61 lc(10vw)`, String.raw`c\61 lc(5vw)`],
  [String.raw`10v\77`, String.raw`5v\77`],
])('recognizes escaped fluid expressions %s', (before, after) => {
  const root = postcss.parse(
    `.a { width: ${before}; } @media (min-width: 768px) { .a { width: ${after}; } }`,
  )
  const issues = findContinuityIssues(root)
  expect(issues).toHaveLength(1)
  expect(issues[0]!.below.value).toBe(before)
  expect(issues[0]!.above.value).toBe(after)
})

it('checks a single declaration using an escaped var function across token breakpoints', () => {
  const css = String.raw`:root { --gap: 10vw }
    @media (min-width: 768px) { :root { --gap: 5vw } }
    .card { width: v\61 r(--gap) }`
  const expected = findContinuityIssues(postcss.parse(css.replace(String.raw`v\61 r`, 'var')))
  expect(expected).toHaveLength(1)
  for (const name of [
    String.raw`v\61 r`,
    String.raw`\76 ar`,
    String.raw`va\72`,
    String.raw`\76\61\72`,
  ]) {
    expect(findContinuityIssues(postcss.parse(css.replace(String.raw`v\61 r`, name)))).toEqual(
      expected,
    )
  }
})

it('does not reuse gutter-stripped values across analyses of a mutated root', () => {
  const root = postcss.parse('.a { width: 10vw } @media (min-width: 768px) { .a { width: 5vw } }')
  expect(findContinuityIssues(root)).toHaveLength(1)
  root.walkDecls((declaration) => {
    if (declaration.value === '5vw') declaration.value = '20vw'
  })
  expect(findContinuityIssues(root)).toEqual([])
})

describe('evaluateLength', () => {
  it.each(['vw', 'vh', 'vi', 'vb', 'vmin', 'vmax'])(
    'avoids intermediate overflow when evaluating a representable %s length',
    (unit) => {
      const context = { width: 100, height: 100, rootFontSize: 16 }
      const result = evaluateLength(`1e308${unit}`, context)
      expect(result).not.toBeNull()
      expect(result! / 1e308).toBeCloseTo(1, 12)
      expect(evaluateLength(`1e308${unit}`, { ...context, width: 1000, height: 1000 })).toBeNull()
    },
  )

  it('resolves the units the compiler emits', () => {
    expect(px('16px')).toBe(16)
    expect(px('1rem')).toBe(16)
    expect(px('10vw', 375)).toBe(37.5)
    expect(px('10vh')).toBe(80)
    expect(px('10vmin')).toBe(76.8)
    expect(px('10vmax')).toBe(80)
  })

  it('resolves calc, min, max and clamp', () => {
    expect(px('calc(0.65rem + 1.49333vw)', 375)).toBeCloseTo(16, 3)
    expect(px('min(10px, 4px, 7px)')).toBe(4)
    expect(px('max(10px, 4px)')).toBe(10)
    expect(px('clamp(5px, 20px, 12px)')).toBe(12)
  })

  it('resolves clamp the way the spec does when the bounds are inverted', () => {
    // `clamp(a, b, c)` is `max(a, min(b, c))`, so a minimum above the maximum
    // wins. Mirroring the spec matters more than mirroring what was meant.
    expect(px('clamp(30px, 20px, 12px)')).toBe(30)
  })

  it('handles nesting and arithmetic precedence', () => {
    expect(px('calc((2px + 3px) * 4)')).toBe(20)
    expect(px('calc(2px + 3px * 4)')).toBe(14)
    expect(px('clamp(1px, calc(100vw / 4), 999px)', 400)).toBe(100)
  })

  it('reads signed numbers and exponents', () => {
    expect(px('calc(1e2px - 40px)')).toBe(60)
    expect(px('calc(10px + -4px)')).toBe(6)
  })

  it('returns null rather than guessing at what it cannot resolve', () => {
    // Each of these is real CSS whose pixel value depends on something the
    // evaluator cannot see. A number here would be an invented one.
    expect(px('var(--adaptive-root-gutter)')).toBeNull()
    expect(px('env(safe-area-inset-top, 0px)')).toBeNull()
    expect(px('50%')).toBeNull()
    expect(px('10cqi')).toBeNull()
    expect(px('solid')).toBeNull()
    expect(px('#ddd')).toBeNull()
    expect(px('calc(10px / 0)')).toBeNull()
    expect(px('clamp(1px, 2px)')).toBeNull()
    expect(px('')).toBeNull()
  })
})

describe('splitComponents', () => {
  it('keeps bracketed groups whole', () => {
    expect(splitComponents('clamp(1px, 2vw, 3px) 4px')).toEqual(['clamp(1px, 2vw, 3px)', '4px'])
    expect(splitComponents('0 0 8px')).toEqual(['0', '0', '8px'])
  })
})

const check = (css: string) => findContinuityIssues(postcss.parse(css))

it('continues diagnosing other groups after excessive expression nesting', () => {
  const deep = `${'calc('.repeat(10_000)}1px${')'.repeat(10_000)}`
  const issues = check(`
    .deep { width: ${deep} }
    .valid { width: 10vw }
    @media (min-width: 768px) {
      .deep { width: 0px }
      .valid { width: 5vw }
    }
  `)
  expect(issues).toHaveLength(1)
  expect(issues[0]).toMatchObject({ selector: '.valid', prop: 'width', breakpoint: 768 })
})

it.each([0, -1, Number.NaN, Infinity, -Infinity, '16', null])(
  'rejects an invalid continuity root font size even for empty CSS: %s',
  (rootFontSize) => {
    expect(() => findContinuityIssues(postcss.parse(''), rootFontSize as number)).toThrow(
      'rootFontSize must be a positive finite number',
    )
  },
)

/**
 * A fixed pixel value written the way the compiler writes one.
 *
 * The check only looks at declarations it produced — a stylesheet it leaves
 * alone may shrink at a breakpoint because its author meant it to. Fixtures
 * therefore cannot be bare `40px`, or every negative case below would pass for
 * that reason instead of the one it names. `min(Npx, 100vw)` is N at any width
 * the tests probe, so the arithmetic stays as obvious as a literal.
 */
const fluid = (value: number) => `min(${value}px, 100vw)`

describe('findContinuityIssues', () => {
  it('analyzes Document roots independently without cross-root false seams', () => {
    const document = postcss.document()
    document.append(postcss.parse('.a { width: min(40px, 100vw) }'))
    document.append(postcss.parse('@media (min-width: 768px) { .a { width: min(20px, 100vw) } }'))
    expect(findContinuityIssues(document)).toEqual([])
  })

  it('combines real Document findings without sharing tokens between roots', () => {
    const document = postcss.document()
    for (const size of [40, 60]) {
      document.append(
        postcss.parse(`:root { --size: ${size}px }
          .a { width: min(var(--size), 100vw) }
          @media (min-width: 768px) { .a { width: min(20px, 100vw) } }`),
      )
    }
    const issues = findContinuityIssues(document)
    expect(issues.map((issue) => issue.below.px)).toEqual([40, 60])
    expect(issues.map((issue) => issue.above.px)).toEqual([20, 20])
    expect(findContinuityIssues(postcss.document())).toEqual([])
  })

  it('tracks unbounded compiler output across a profile breakpoint', async () => {
    const result = await postcss([
      adaptiveMatrix({
        defaultProfile: 'app',
        libraries: false,
        hairline: 0,
        profiles: {
          app: { designWidth: 400, query: '(max-width: 767.98px)' },
          pc: { designWidth: 800, query: '(min-width: 768px)' },
        },
      }),
    ]).process('.card { width: 40px } @adaptive pc { .card { width: 20px } }', {
      from: '/project/src/app.css',
    })

    expect(result.css).toContain('calc(10vw)')
    expect(result.css).toContain('calc(2.5vw)')
    expect(findContinuityIssues(result.root)).toHaveLength(1)
  })

  it('finds a length that shrinks as the viewport grows', () => {
    // Measured in Chrome before this check existed: a card authored at 16px on
    // a 375 canvas and 18px on a 1440 canvas renders 17.57px at 767px and
    // 16.18px at 768px. The text gets smaller when the window gets wider.
    const issues = check(`
      .card { font-size: clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem) }
      @media (min-width: 768px) {
        .card { font-size: clamp(1.01125rem, calc(0.73125rem + 0.4375vw), 1.25625rem) }
      }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.selector).toBe('.card')
    expect(issues[0]!.prop).toBe('font-size')
    expect(issues[0]!.breakpoint).toBe(768)
    expect(issues[0]!.below.px).toBeCloseTo(17.57, 1)
    expect(issues[0]!.above.px).toBeCloseTo(16.18, 1)
  })

  it('stays quiet when the value grows across the breakpoint', () => {
    expect(
      check(`
        .card { width: clamp(292.69px, 91.46667vw, 439.04px) }
        @media (min-width: 768px) {
          .card { width: clamp(455.11px, 44.44444vw, 853.33px) }
        }
      `),
    ).toEqual([])
  })

  it('reads a negative length by its distance from zero', () => {
    // An overhang is drawn bigger by going further from zero, and the compiler
    // scales it that way, so a negative length's formula falls as the viewport
    // grows. Comparing raw values inverted the check for every one of them: the
    // wider canvas asking for a deeper overhang was reported...
    const deeper = check(`
      .a { margin-left: clamp(-20.48px, -4.26667vw, -13.65333px) }
      @media (min-width: 768px) {
        .a { margin-left: clamp(-53.33333px, -2.77778vw, -28.44444px) }
      }
    `)
    expect(deeper).toEqual([])

    // ...while the overhang all but vanishing at the breakpoint was not.
    const collapsing = check(`
      .a { margin-left: clamp(-20.48px, -4.26667vw, -13.65333px) }
      @media (min-width: 768px) {
        .a { margin-left: clamp(-5.33333px, -0.27778vw, -2.84444px) }
      }
    `)
    expect(collapsing).toHaveLength(1)
    expect(collapsing[0]!.below.px).toBeCloseTo(-20.48, 1)
    expect(collapsing[0]!.above.px).toBeCloseTo(-2.84, 1)
  })

  it('says nothing when the value changes sign across the breakpoint', () => {
    // Zero is a boundary the compiler never crosses on its own, so meeting one
    // here means the two canvases were written with different intents — and
    // which of them is wrong is not something this can know.
    expect(
      check(`
        .a { margin-left: clamp(-20.48px, -4.26667vw, -13.65333px) }
        @media (min-width: 768px) {
          .a { margin-left: clamp(2.13px, 0.27778vw, 4.27px) }
        }
      `),
    ).toEqual([])
  })

  it('compares shorthand components one by one', () => {
    const issues = check(`
      .a { margin: ${fluid(10)} ${fluid(40)} }
      @media (min-width: 768px) { .a { margin: ${fluid(20)} ${fluid(30)} } }
    `)

    // The first component grew and the second shrank; only the second is a step
    // backwards, and reporting the declaration as a whole would hide which.
    expect(issues).toHaveLength(1)
    expect(issues[0]!.below.value).toBe(fluid(40))
    expect(issues[0]!.above.value).toBe(fluid(30))
  })

  it('says nothing when the component counts differ', () => {
    expect(
      check(`
        .a { margin: ${fluid(10)} ${fluid(40)} }
        @media (min-width: 768px) { .a { margin: ${fluid(5)} } }
      `),
    ).toEqual([])
  })

  it('drops a group it cannot fully resolve rather than half-checking it', () => {
    // `@supports` may or may not apply; assuming it does would invent a cascade
    // that never happens on browsers without the feature.
    expect(
      check(`
        .a { width: ${fluid(40)} }
        @supports (display: grid) {
          @media (min-width: 768px) { .a { width: ${fluid(20)} } }
        }
      `),
    ).toEqual([])
  })

  it('drops a group whose media query is not a plain width test', () => {
    expect(
      check(`
        .a { width: ${fluid(40)} }
        @media print, (min-width: 768px) { .a { width: ${fluid(20)} } }
        .b { width: ${fluid(40)} }
        @media (min-width: 768px) and (orientation: landscape) { .b { width: ${fluid(20)} } }
      `),
    ).toEqual([])
  })

  it('drops a group split across cascade layers', () => {
    // An unlayered declaration beats a layered one wherever it was written, so
    // source order no longer decides the winner.
    expect(
      check(`
        @layer base { .a { width: ${fluid(40)} } }
        @media (min-width: 768px) { .a { width: ${fluid(20)} } }
      `),
    ).toEqual([])
  })

  it('does not confuse an anonymous layer with the unlayered cascade', () => {
    expect(
      check(`
        @layer { .a { width: ${fluid(40)} } }
        @media (min-width: 768px) { .a { width: ${fluid(20)} } }
      `),
    ).toEqual([])

    // Every anonymous layer is distinct even though none has a written name.
    expect(
      check(`
        @layer { .b { width: ${fluid(40)} } }
        @layer { @media (min-width: 768px) { .b { width: ${fluid(20)} } } }
      `),
    ).toEqual([])
  })

  it('checks within a single layer, where source order still decides', () => {
    expect(
      check(`
        @layer base { .a { width: ${fluid(40)} } }
        @layer base { @media (min-width: 768px) { .a { width: ${fluid(20)} } } }
      `),
    ).toHaveLength(1)
  })

  it('matches nested named layers to dotted paths without merging sibling layers', () => {
    const issues = check(`
      @layer components { @layer cards { .a { width: ${fluid(40)} !important } } }
      @layer components.cards {
        @media (min-width: 768px) { .a { width: ${fluid(20)} !important } }
      }
      @layer components { @layer first { .b { width: ${fluid(40)} } } }
      @layer components { @layer second {
        @media (min-width: 768px) { .b { width: ${fluid(20)} } }
      } }
    `)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.selector).toBe('.a')
    expect(issues[0]!.below.px).toBe(40)
    expect(issues[0]!.above.px).toBe(20)
  })

  it('applies declaration importance before source order', () => {
    expect(
      check(`
        .a { width: ${fluid(40)} !important }
        @media (min-width: 768px) { .a { width: ${fluid(20)} } }
      `),
    ).toEqual([])

    expect(
      check(`
        .a { width: ${fluid(40)} }
        @media (min-width: 768px) { .a { width: ${fluid(20)} !important } }
      `),
    ).toHaveLength(1)
  })

  it('skips inactive high-priority declarations and orders matching important declarations', () => {
    const issues = check(`
      .a { width: ${fluid(40)} !important }
      @media (min-width: 768px) { .a { width: ${fluid(30)} !important } }
      @media (min-width: 768px) { .a { width: ${fluid(20)} !important } }
      @media (min-width: 2000px) { .a { width: ${fluid(10)} !important } }
      .a { width: ${fluid(100)} }
    `)
    expect(issues).toHaveLength(2)
    expect(issues.map(({ breakpoint, below, above }) => [breakpoint, below.px, above.px])).toEqual([
      [768, 40, 20],
      [2000, 20, 10],
    ])
  })

  it('ignores values it cannot put a number to', () => {
    // A token this stylesheet never defines. It used to be spelled
    // `--adaptive-root-gutter` here, which stopped being an example of an
    // unresolvable value once the gutter acquired a meaning of its own.
    expect(
      check(`
        .bar { left: ${fluid(8)} }
        @media (min-width: 768px) { .bar { left: var(--theme-inset) } }
      `),
    ).toEqual([])
  })

  it('sees through a token to the length behind it', () => {
    // Without this the check gave up at the first `var(`, which on a component
    // library is most of the file: Vant 4.10.0 reads 1173 of its 3198 ordinary
    // declarations entirely through tokens.
    const issues = check(`
      :root,:host { --card-width: ${fluid(40)} }
      .a { width: var(--card-width) }
      @media (min-width: 768px) { .a { width: ${fluid(20)} } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.below.px).toBe(40)
    expect(issues[0]!.above.px).toBe(20)
  })

  it('follows a token redefined at the breakpoint under one declaration', () => {
    // The rule never changes. What it reads does — and the author, looking at
    // one `width` in one place, has nothing to compare.
    const issues = check(`
      :root { --card-width: ${fluid(40)} }
      @media (min-width: 768px) { :root { --card-width: ${fluid(20)} } }
      .a { width: var(--card-width) }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.breakpoint).toBe(768)
    expect(issues[0]!.below.value).toBe(fluid(40))
    expect(issues[0]!.above.value).toBe(fluid(20))
  })

  it('follows a case-insensitive VAR() under one declaration', () => {
    const issues = check(`
      :root { --card-width: ${fluid(40)} }
      @media (min-width: 768px) { :root { --card-width: ${fluid(20)} } }
      .a { width: VAR(--card-width) }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.breakpoint).toBe(768)
  })

  it('groups standard property names using CSS ASCII case-insensitivity', () => {
    const issues = check(`
      .a { FONT-SIZE: ${fluid(40)} }
      @media (min-width: 768px) { .a { font-size: ${fluid(20)} } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.prop).toBe('font-size')
    expect(issues[0]!.breakpoint).toBe(768)
  })

  it('groups escaped and literal spellings of the same standard property', () => {
    const issues = check(String.raw`
      .a { f\6f nt-size: ${fluid(40)} }
      @media (min-width: 768px) { .a { font-size: ${fluid(20)} } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.prop).toBe('font-size')
  })

  it('declines a token a theme class can override', () => {
    // `.dark { --card-width: ... }` puts the value under an ancestor's class,
    // and no width tells you which one an element sits beneath.
    expect(
      check(`
        :root { --card-width: ${fluid(40)} }
        .dark { --card-width: ${fluid(30)} }
        .a { width: var(--card-width) }
        @media (min-width: 768px) { .a { width: ${fluid(20)} } }
      `),
    ).toEqual([])
  })

  it('respects max-width bounds, not just min-width', () => {
    const issues = check(`
      @media (max-width: 767.98px) { .a { width: ${fluid(40)} } }
      @media (min-width: 768px) { .a { width: ${fluid(20)} } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.breakpoint).toBe(768)
  })

  it('detects shrinking unbounded viewport output without a math wrapper', () => {
    const issues = check('.a { width: 10vw } @media (min-width: 768px) { .a { width: 5vw } }')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.below.value).toBe('10vw')
    expect(issues[0]!.above.value).toBe('5vw')
  })

  it.each(['clamp', 'viewport'] as const)(
    'finds an unbounded canvas seam with %s output',
    async (strategy) => {
      const result = await postcss([
        adaptiveMatrix({
          profiles: { app: 375, desktop: 1440 },
          routes: [{ media: { minWidth: 768 }, profile: 'desktop' }],
          libraries: false,
          strategy,
        }),
      ]).process('.card { width: 24px } @media (min-width: 768px) { .card { width: 24px } }', {
        from: 'unbounded.css',
      })
      expect(result.warnings()).toEqual([])
      const values: string[] = []
      result.root.walkDecls('width', (declaration) => {
        values.push(declaration.value)
      })
      expect(values).toEqual(
        strategy === 'clamp' ? ['calc(6.4vw)', 'calc(1.66667vw)'] : ['6.4vw', '1.66667vw'],
      )
      const issues = findContinuityIssues(result.root)
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ selector: '.card', prop: 'width', breakpoint: 768 })
      expect(issues[0]!.below.px).toBeGreaterThan(issues[0]!.above.px)
    },
  )

  it('reports a breakpoint once, not once per boundary that straddles it', () => {
    // `(max-width: 767.98px)` and `(min-width: 768px)` are two boundaries
    // describing one transition. Probing each would report the same step twice.
    const issues = check(`
      @media (max-width: 767.98px) { .a { font-size: ${fluid(20)} } }
      @media (min-width: 768px) { .a { font-size: ${fluid(10)} } }
    `)

    expect(issues).toHaveLength(1)
  })

  it('keeps merged report values aligned with the final reported breakpoint', () => {
    const issues = check(`
      @media (max-width: 767.98px) { .a { width: calc(10vw) } }
      @media (min-width: 768px) { .a { width: calc(5vw) } }
    `)
    expect(issues).toHaveLength(1)
    const issue = issues[0]!
    expect(issue.breakpoint).toBe(768)
    expect(issue.below.px).toBeCloseTo(px(issue.below.value, issue.breakpoint - 0.05)!, 10)
    expect(issue.above.px).toBeCloseTo(px(issue.above.value, issue.breakpoint + 0.05)!, 10)
  })

  it('says nothing about custom properties, whose consumer decides the sign', () => {
    // This is the compiler's own foundation. A narrower root width is how the
    // gutter gets wider, so shrinking here is the whole point.
    expect(
      check(`
        :root { --adaptive-root-width: ${fluid(1000)} }
        @media (min-width: 768px) { :root { --adaptive-root-width: ${fluid(600)} } }
      `),
    ).toEqual([])
  })

  it('says nothing about a stylesheet with no breakpoints at all', () => {
    expect(check(`.a { width: ${fluid(40)} } .a { width: ${fluid(20)} }`)).toEqual([])
  })

  it('does not probe a physically impossible negative viewport below zero', () => {
    expect(
      check(`
        @media (max-width: 0px) { .a { width: ${fluid(40)} } }
        @media (min-width: 0px) { .a { width: ${fluid(20)} } }
      `),
    ).toEqual([])
  })

  it('does not treat a nested rule as its own selector', () => {
    // The effective selector is a join of two, which is more cascade than this
    // check models — so it declines rather than reporting against `& span`.
    expect(
      check(`
        .a { span { width: ${fluid(40)} } }
        @media (min-width: 768px) { .a { span { width: ${fluid(20)} } } }
      `),
    ).toEqual([])
  })

  it('leaves a stylesheet it did not compile alone', () => {
    // Quasar 2.19 draws `.q-tooltip` with 16px of padding on a phone and 10px
    // from 600px up. That is a touch-target decision, taken deliberately, with
    // both numbers written by hand — not two canvases disagreeing. Quasar is a
    // `designWidth: false` entry, so neither side was converted, and the
    // monotonicity argument that makes this check complete says nothing about
    // lengths the compiler never touched. Reporting them is noise.
    expect(
      check(`
        .q-tooltip { padding: 6px 10px }
        @media (max-width: 599.98px) { .q-tooltip { padding: 8px 16px } }
      `),
    ).toEqual([])

    // One converted side is enough: that is a canvas boundary, and nobody
    // compared the two numbers.
    expect(
      check(`
        .a { width: ${fluid(40)} }
        @media (min-width: 768px) { .a { width: 20px } }
      `),
    ).toHaveLength(1)
  })
})

describe('the fixed-position gutter', () => {
  /** The foundation the two-canvas preset writes when it corrects fixed elements. */
  const foundation = `
    :root { --adaptive-root-width: 100vw;
            --adaptive-root-gutter: max(0px, (100vw - var(--adaptive-root-width)) / 2) }
    @media (max-width: 767.98px) { :root { --adaptive-root-width: 480px } }
    @media (min-width: 768px) { :root { --adaptive-root-width: 1920px } }
  `

  it('is not a seam, however far it steps at the breakpoint', () => {
    // A tab bar authored as `left: 0` sits 144px inside a 480px app column at
    // 768px wide, and flush at 0 one pixel later against a 1920px desktop
    // column. Read as a design length that is a large step backwards; read as
    // what it is, it is the correction doing its job. Left in, this fires twice
    // for every fixed element in the default preset.
    expect(check(`${foundation} .tabbar { left: var(--adaptive-root-gutter) }`)).toEqual([])
  })

  it('still compares everything else in the same declaration', () => {
    // Zeroing the gutter rather than skipping the declaration: the canvases
    // genuinely disagree about the inset here, and a correction this compiler
    // added itself must not be able to hide that.
    const issues = check(`
      ${foundation}
      .tabbar { left: calc(${fluid(40)} + var(--adaptive-root-gutter)) }
      @media (min-width: 768px) { .tabbar { left: calc(${fluid(20)} + var(--adaptive-root-gutter)) } }
    `)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.prop).toBe('left')
  })

  it('does not hide a similarly named authored variable', () => {
    const css = `
      :root { --adaptive-root-gutter-extra: ${fluid(0)} }
      .tabbar { left: calc(${fluid(40)} + var(--adaptive-root-gutter-extra)) }
      @media (min-width: 768px) {
        .tabbar { left: calc(${fluid(20)} + var(--adaptive-root-gutter-extra)) }
      }
    `

    expect(check(css)).toHaveLength(1)
  })
})
