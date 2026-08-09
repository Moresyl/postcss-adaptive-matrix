import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { findContinuityIssues } from '../src/core/continuity.js'
import { evaluateLength, splitComponents } from '../src/core/evaluate.js'

const AT = { width: 768, height: 800, rootFontSize: 16 }
const px = (value: string, width = AT.width) =>
  evaluateLength(value, { ...AT, width })

describe('evaluateLength', () => {
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
    expect(splitComponents('clamp(1px, 2vw, 3px) 4px')).toEqual([
      'clamp(1px, 2vw, 3px)',
      '4px',
    ])
    expect(splitComponents('0 0 8px')).toEqual(['0', '0', '8px'])
  })
})

const check = (css: string) => findContinuityIssues(postcss.parse(css))

describe('findContinuityIssues', () => {
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
      .a { margin: 10px 40px }
      @media (min-width: 768px) { .a { margin: 20px 30px } }
    `)

    // The first component grew and the second shrank; only the second is a step
    // backwards, and reporting the declaration as a whole would hide which.
    expect(issues).toHaveLength(1)
    expect(issues[0]!.below.value).toBe('40px')
    expect(issues[0]!.above.value).toBe('30px')
  })

  it('says nothing when the component counts differ', () => {
    expect(
      check(`
        .a { margin: 10px 40px }
        @media (min-width: 768px) { .a { margin: 5px } }
      `),
    ).toEqual([])
  })

  it('drops a group it cannot fully resolve rather than half-checking it', () => {
    // `@supports` may or may not apply; assuming it does would invent a cascade
    // that never happens on browsers without the feature.
    expect(
      check(`
        .a { width: 40px }
        @supports (display: grid) {
          @media (min-width: 768px) { .a { width: 20px } }
        }
      `),
    ).toEqual([])
  })

  it('drops a group whose media query is not a plain width test', () => {
    expect(
      check(`
        .a { width: 40px }
        @media print, (min-width: 768px) { .a { width: 20px } }
        .b { width: 40px }
        @media (min-width: 768px) and (orientation: landscape) { .b { width: 20px } }
      `),
    ).toEqual([])
  })

  it('drops a group split across cascade layers', () => {
    // An unlayered declaration beats a layered one wherever it was written, so
    // source order no longer decides the winner.
    expect(
      check(`
        @layer base { .a { width: 40px } }
        @media (min-width: 768px) { .a { width: 20px } }
      `),
    ).toEqual([])
  })

  it('checks within a single layer, where source order still decides', () => {
    expect(
      check(`
        @layer base { .a { width: 40px } }
        @layer base { @media (min-width: 768px) { .a { width: 20px } } }
      `),
    ).toHaveLength(1)
  })

  it('ignores values it cannot put a number to', () => {
    expect(
      check(`
        .bar { left: 0 }
        @media (min-width: 768px) { .bar { left: var(--adaptive-root-gutter) } }
      `),
    ).toEqual([])
  })

  it('sees through a token to the length behind it', () => {
    // Without this the check gave up at the first `var(`, which on a component
    // library is most of the file: Vant 4.10.0 reads 1173 of its 3198 ordinary
    // declarations entirely through tokens.
    const issues = check(`
      :root,:host { --card-width: 40px }
      .a { width: var(--card-width) }
      @media (min-width: 768px) { .a { width: 20px } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.below.px).toBe(40)
    expect(issues[0]!.above.px).toBe(20)
  })

  it('follows a token redefined at the breakpoint under one declaration', () => {
    // The rule never changes. What it reads does — and the author, looking at
    // one `width` in one place, has nothing to compare.
    const issues = check(`
      :root { --card-width: 40px }
      @media (min-width: 768px) { :root { --card-width: 20px } }
      .a { width: var(--card-width) }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.breakpoint).toBe(768)
    expect(issues[0]!.below.value).toBe('40px')
    expect(issues[0]!.above.value).toBe('20px')
  })

  it('declines a token a theme class can override', () => {
    // `.dark { --card-width: ... }` puts the value under an ancestor's class,
    // and no width tells you which one an element sits beneath.
    expect(
      check(`
        :root { --card-width: 40px }
        .dark { --card-width: 30px }
        .a { width: var(--card-width) }
        @media (min-width: 768px) { .a { width: 20px } }
      `),
    ).toEqual([])
  })

  it('respects max-width bounds, not just min-width', () => {
    const issues = check(`
      @media (max-width: 767.98px) { .a { width: 40px } }
      @media (min-width: 768px) { .a { width: 20px } }
    `)

    expect(issues).toHaveLength(1)
    expect(issues[0]!.breakpoint).toBe(768)
  })

  it('reports a breakpoint once, not once per boundary that straddles it', () => {
    // `(max-width: 767.98px)` and `(min-width: 768px)` are two boundaries
    // describing one transition. Probing each would report the same step twice.
    const issues = check(`
      @media (max-width: 767.98px) { .a { font-size: 20px } }
      @media (min-width: 768px) { .a { font-size: 10px } }
    `)

    expect(issues).toHaveLength(1)
  })

  it('says nothing about custom properties, whose consumer decides the sign', () => {
    // This is the compiler's own foundation. A narrower root width is how the
    // gutter gets wider, so shrinking here is the whole point.
    expect(
      check(`
        :root { --adaptive-root-width: 100vw }
        @media (min-width: 768px) { :root { --adaptive-root-width: 600px } }
      `),
    ).toEqual([])
  })

  it('says nothing about a stylesheet with no breakpoints at all', () => {
    expect(check('.a { width: 40px } .a { width: 20px }')).toEqual([])
  })

  it('does not treat a nested rule as its own selector', () => {
    // The effective selector is a join of two, which is more cascade than this
    // check models — so it declines rather than reporting against `& span`.
    expect(
      check(`
        .a { span { width: 40px } }
        @media (min-width: 768px) { .a { span { width: 20px } } }
      `),
    ).toEqual([])
  })
})
