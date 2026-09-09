import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { collectTokens } from '../src/core/tokens.js'

function table(css: string): ReturnType<typeof collectTokens> {
  return collectTokens(postcss.parse(css, { from: 'a.css' }))
}

describe('theme token resolution', () => {
  it('skips inactive important definitions and keeps the latest applicable priority', () => {
    const tokens = table(`
      :root { --gap: 8px }
      @media (min-width: 600px) { :root { --gap: 16px !important } }
      @media (min-width: 900px) { :root { --gap: 24px !important } }
      :root { --gap: 12px }
      @media (min-width: 2000px) { :root { --gap: 48px !important } }
    `)
    expect(tokens.resolve('var(--gap)', 400)).toBe('12px')
    expect(tokens.resolve('var(--gap)', 700)).toBe('16px')
    expect(tokens.resolve('var(--gap)', 1000)).toBe('24px')
    expect(tokens.resolve('var(--gap)', 2200)).toBe('48px')
    expect(tokens.boundaries).toEqual([600, 900, 2000])
  })

  it('selects the correct token at exclusive and inclusive range endpoints', () => {
    const tokens = table(`
      :root { --gap: 8px }
      @media (width < 768px) { :root { --gap: 16px } }
      @media (768px < width <= 1024px) { :root { --gap: 32px } }
    `)
    expect(tokens.resolve('var(--gap)', 767.99)).toBe('16px')
    expect(tokens.resolve('var(--gap)', 768)).toBe('8px')
    expect(tokens.resolve('var(--gap)', 768.01)).toBe('32px')
    expect(tokens.resolve('var(--gap)', 1024)).toBe('32px')
    expect(tokens.resolve('var(--gap)', 1024.01)).toBe('8px')
    expect(tokens.boundaries).toEqual([768, 1024])
  })

  it('uses a fallback at the excluded boundary of an otherwise unset token', () => {
    const tokens = table('@media (width > 768px) { :root { --gap: 32px } }')
    expect(tokens.resolve('var(--gap, 16px)', 768)).toBe('16px')
    expect(tokens.resolve('var(--gap, 16px)', 768.01)).toBe('32px')
  })

  it('substitutes a token declared on :root', () => {
    const tokens = table(':root { --gap: 16px } .a { padding: var(--gap) }')
    expect(tokens.resolve('var(--gap)', 400)).toBe('16px')
  })

  it('recognises a custom property whose leading hyphens are escaped', () => {
    const tokens = table(String.raw`:root { \2d\2d gap: 16px }`)
    expect(tokens.resolve('var(--gap)', 400)).toBe('16px')
  })

  it('accepts the :root,:host pair component libraries ship', () => {
    // Vant declares all 815 of its tokens this way so one stylesheet themes
    // both the document and a shadow tree. Reading only `:root` saw none of
    // them, and the whole theming layer went unchecked.
    const tokens = table(':root,:host { --gap: 16px }')
    expect(tokens.resolve('var(--gap)', 400)).toBe('16px')
  })

  it('follows a token that reads another token', () => {
    const tokens = table(':root { --base: 8px; --gap: var(--base) }')
    expect(tokens.resolve('calc(var(--gap) * 2)', 400)).toBe('calc(8px * 2)')
  })

  it('picks the definition that applies at the given width', () => {
    const tokens = table(
      ':root { --gap: 16px } @media (min-width: 768px) { :root { --gap: 32px } }',
    )
    expect(tokens.resolve('var(--gap)', 500)).toBe('16px')
    expect(tokens.resolve('var(--gap)', 900)).toBe('32px')
    expect(tokens.boundaries).toEqual([768])
  })

  it('applies custom-property importance before source order', () => {
    const early = table(':root { --gap: 16px !important; --gap: 24px }')
    expect(early.resolve('var(--gap)', 400)).toBe('16px')

    const middle = table(':root { --gap: 8px; --gap: 16px !important; --gap: 24px }')
    expect(middle.resolve('var(--gap)', 400)).toBe('16px')
  })

  it('refuses selector specificity and layer precedence it does not model', () => {
    expect(
      table(':root:root { --gap: 16px } :root { --gap: 24px }').resolve('var(--gap)', 400),
    ).toBeNull()
    expect(table('@layer theme { :root { --gap: 16px } }').resolve('var(--gap)', 400)).toBeNull()
  })

  it('refuses a token that any other selector also declares', () => {
    // `.van-theme-dark { --gap: 20px }` means an element's value depends on an
    // ancestor's class, which is not a function of viewport width. Answering
    // `16px` here would be a guess dressed up as a measurement.
    const tokens = table(':root { --gap: 16px } .dark { --gap: 20px }')
    expect(tokens.resolve('var(--gap)', 400)).toBeNull()
    expect(tokens.size).toBe(0)
  })

  it('refuses a token declared under a condition it cannot evaluate', () => {
    for (const wrapper of [
      '@supports (display: grid)',
      '@container (min-width: 30em)',
      '@media (orientation: landscape)',
      '@media print, screen',
    ]) {
      const tokens = table(`${wrapper} { :root { --gap: 16px } }`)
      expect(tokens.resolve('var(--gap)', 400), wrapper).toBeNull()
    }
  })

  it('uses a fallback only when nothing declares the token', () => {
    expect(table('.a { color: red }').resolve('var(--gap, 16px)', 400)).toBe('16px')
    // Declared, but not knowably — the fallback is not what the browser would
    // use, so there is no answer to give.
    expect(table('.dark { --gap: 20px }').resolve('var(--gap, 16px)', 400)).toBeNull()
    // Declared only above a breakpoint: genuinely unset below it, and the
    // fallback is exactly what a browser resolves to there.
    const scoped = table('@media (min-width: 768px) { :root { --gap: 32px } }')
    expect(scoped.resolve('var(--gap, 16px)', 400)).toBe('16px')
    expect(scoped.resolve('var(--gap, 16px)', 900)).toBe('32px')
  })

  it('does not mistake a registered custom property for an unset token', () => {
    const registration = postcss.parse(
      "@property --gap { syntax: '<length>'; inherits: false; initial-value: 24px }",
    )
    registration.walkAtRules('property', (atRule) => {
      atRule.name = String.raw`pr\6f perty`
    })
    expect(collectTokens(registration).resolve('var(--gap, 16px)', 400)).toBeNull()
    const tokens = table(`
      @PROPERTY --gap {
        syntax: '<length>';
        inherits: false;
        initial-value: 24px;
      }
    `)
    expect(tokens.resolve('var(--gap, 16px)', 400)).toBeNull()
    expect(tokens.size).toBe(0)

    // Escaped and literal spellings identify the same registered property.
    const escaped = table(
      String.raw`@property --\67 ap { syntax: '<length>'; initial-value: 24px }`,
    )
    expect(escaped.resolve('var(--gap, 16px)', 400)).toBeNull()
  })

  it('gives no answer for an undeclared token without a fallback', () => {
    expect(table('.a { color: red }').resolve('var(--gap)', 400)).toBeNull()
  })

  it('substitutes every reference in a multi-part value', () => {
    const tokens = table(':root { --y: 8px; --x: 16px }')
    expect(tokens.resolve('var(--y) var(--x)', 400)).toBe('8px 16px')
    expect(tokens.resolve('calc(var(--x) + var(--y))', 400)).toBe('calc(16px + 8px)')
  })

  it('recognises case-insensitive var() and ignores parentheses inside strings', () => {
    const tokens = table(':root { --x: 16px }')
    expect(tokens.resolve('VAR(--x)', 400)).toBe('16px')
    expect(tokens.resolve('var(--missing, func(")")) var(--x)', 400)).toBe('func(")") 16px')
  })

  it('resolves escaped spellings of var() and its custom-property name', () => {
    const tokens = table(':root { --gap: 16px }')
    expect(tokens.resolve(String.raw`v\61r(\2d\2d gap)`, 400)).toBe('16px')
    expect(tokens.resolve(String.raw`xv\61r(--gap)`, 400)).toBe(String.raw`xv\61r(--gap)`)
    expect(tokens.resolve(String.raw`"v\61r(--gap)" v\61r(--gap)`, 400)).toBe(
      String.raw`"v\61r(--gap)" 16px`,
    )
  })

  it('does not substitute var-shaped text inside strings or comments', () => {
    const tokens = table(':root { --x: 16px }')
    expect(tokens.resolve('"var(--missing)" VAR(--x)', 400)).toBe('"var(--missing)" 16px')
    expect(tokens.resolve('/* var(--missing) */ var(--x)', 400)).toBe('/* var(--missing) */ 16px')
    expect(tokens.resolve(String.raw`"escaped \" var(--missing)" var(--x)`, 400)).toBe(
      String.raw`"escaped \" var(--missing)" 16px`,
    )
  })

  it('returns a value with no var() unchanged', () => {
    expect(table(':root { --x: 1px }').resolve('clamp(1px, 2vw, 3px)', 400)).toBe(
      'clamp(1px, 2vw, 3px)',
    )
  })

  it('does not mistake an identifier ending in var for a reference', () => {
    expect(table(':root { --x: 1px }').resolve('my-var(--x)', 400)).toBe('my-var(--x)')
    expect(table(':root { --x: 1px }').resolve('宽var(--x)', 400)).toBe('宽var(--x)')
  })

  it('stops on a cycle rather than recursing forever', () => {
    const tokens = table(':root { --a: var(--b); --b: var(--a) }')
    expect(tokens.resolve('var(--a)', 400)).toBeNull()
  })

  it('gives no answer for a malformed reference', () => {
    const tokens = table(':root { --x: 1px }')
    expect(tokens.resolve('var(--x', 400)).toBeNull()
    expect(tokens.resolve('var(notaname)', 400)).toBeNull()
    expect(tokens.resolve('var(--missing garbage, 16px)', 400)).toBeNull()
    expect(tokens.resolve('var(--, 16px)', 400)).toBeNull()
    expect(tokens.resolve('var(--bad:, 16px)', 400)).toBeNull()
  })

  it('accepts escaped custom-property names without inventing their value', () => {
    const tokens = table(':root { --x: 1px }')
    expect(tokens.resolve(String.raw`var(--\31 gap, 16px)`, 400)).toBe('16px')
    expect(tokens.resolve(String.raw`var(--\g, 16px)`, 400)).toBe('16px')
  })

  it('treats comments around a var() name as whitespace', () => {
    const tokens = table(':root { --x: 16px }')
    expect(tokens.resolve('var(/* before */ --x /**/)', 400)).toBe('16px')
    expect(tokens.resolve('var(--/**/x, 8px)', 400)).toBeNull()
    expect(tokens.resolve('var(--x/* open, 8px)', 400)).toBeNull()
  })

  it('does not split fallback arguments on escaped or commented commas', () => {
    expect(table(String.raw`:root { --\,: 16px }`).resolve(String.raw`var(--\,)`, 400)).toBe('16px')
    expect(table('.a { color: red }').resolve('var(--missing/* , */, 8px)', 400)).toBe('8px')
  })

  it('matches equivalent escaped and literal custom-property names', () => {
    expect(table(String.raw`:root { --\67 ap: 16px }`).resolve('var(--gap)', 400)).toBe('16px')
    expect(table(':root { --gap: 16px }').resolve(String.raw`var(--\67 ap)`, 400)).toBe('16px')
    expect(table(':root { --Gap: 16px }').resolve('var(--gap)', 400)).toBeNull()
  })

  it('does not consume non-CSS whitespace after a hexadecimal escape', () => {
    const tokens = table(':root { --x\\31\u00a0a: 16px; --x1a: 8px }')
    expect(tokens.resolve('var(--x\\31\u00a0a)', 400)).toBe('16px')
    expect(tokens.resolve('var(--x1a)', 400)).toBe('8px')
  })

  it('leaves env() unresolved, so a safe-area value stays unknown', () => {
    // The foundation layer writes `--adaptive-safe-top: env(...)`. Substituting
    // it is correct and still yields nothing a number can be put to, which is
    // the honest answer for a value only the device knows.
    const tokens = table(':root { --safe: env(safe-area-inset-top, 0px) }')
    expect(tokens.resolve('var(--safe)', 400)).toBe('env(safe-area-inset-top, 0px)')
  })
})
