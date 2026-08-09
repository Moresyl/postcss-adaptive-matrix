import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { collectTokens } from '../src/core/tokens.js'

function table(css: string): ReturnType<typeof collectTokens> {
  return collectTokens(postcss.parse(css, { from: 'a.css' }))
}

describe('theme token resolution', () => {
  it('substitutes a token declared on :root', () => {
    const tokens = table(':root { --gap: 16px } .a { padding: var(--gap) }')
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

  it('gives no answer for an undeclared token without a fallback', () => {
    expect(table('.a { color: red }').resolve('var(--gap)', 400)).toBeNull()
  })

  it('substitutes every reference in a multi-part value', () => {
    const tokens = table(':root { --y: 8px; --x: 16px }')
    expect(tokens.resolve('var(--y) var(--x)', 400)).toBe('8px 16px')
    expect(tokens.resolve('calc(var(--x) + var(--y))', 400)).toBe('calc(16px + 8px)')
  })

  it('returns a value with no var() unchanged', () => {
    expect(table(':root { --x: 1px }').resolve('clamp(1px, 2vw, 3px)', 400)).toBe(
      'clamp(1px, 2vw, 3px)',
    )
  })

  it('does not mistake an identifier ending in var for a reference', () => {
    expect(table(':root { --x: 1px }').resolve('my-var(--x)', 400)).toBe('my-var(--x)')
  })

  it('stops on a cycle rather than recursing forever', () => {
    const tokens = table(':root { --a: var(--b); --b: var(--a) }')
    expect(tokens.resolve('var(--a)', 400)).toBeNull()
  })

  it('gives no answer for a malformed reference', () => {
    const tokens = table(':root { --x: 1px }')
    expect(tokens.resolve('var(--x', 400)).toBeNull()
    expect(tokens.resolve('var(notaname)', 400)).toBeNull()
  })

  it('leaves env() unresolved, so a safe-area value stays unknown', () => {
    // The foundation layer writes `--adaptive-safe-top: env(...)`. Substituting
    // it is correct and still yields nothing a number can be put to, which is
    // the honest answer for a value only the device knows.
    const tokens = table(':root { --safe: env(safe-area-inset-top, 0px) }')
    expect(tokens.resolve('var(--safe)', 400)).toBe('env(safe-area-inset-top, 0px)')
  })
})
