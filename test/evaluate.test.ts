import { describe, expect, it } from 'vitest'
import { evaluateLength, splitComponents } from '../src/core/evaluate.js'

/**
 * The arithmetic behind every "shrinks" diagnostic.
 *
 * `continuity.ts` compares two lengths at a viewport width and says whether one
 * gets smaller as the other grows. That comparison is only worth printing if the
 * numbers are right, and only safe to print at all if a length this evaluator
 * cannot resolve comes back as `null` rather than as a plausible number. Both
 * halves are checked here: what it computes, and what it refuses to.
 */
const context = { width: 1000, height: 800, rootFontSize: 16 }

describe('evaluateLength', () => {
  it('resolves the units the compiler emits', () => {
    expect(evaluateLength('16px', context)).toBe(16)
    expect(evaluateLength('16', context)).toBe(16)
    expect(evaluateLength('2rem', context)).toBe(32)
    expect(evaluateLength('2em', context)).toBe(32)
    expect(evaluateLength('10vw', context)).toBe(100)
    expect(evaluateLength('10vi', context)).toBe(100)
    expect(evaluateLength('10vh', context)).toBe(80)
    expect(evaluateLength('10vb', context)).toBe(80)
    expect(evaluateLength('10vmin', context)).toBe(80)
    expect(evaluateLength('10vmax', context)).toBe(100)
  })

  it('evaluates the functions a compiled length is made of', () => {
    expect(evaluateLength('calc(10vw + 8px)', context)).toBe(108)
    expect(evaluateLength('min(10vw, 40px)', context)).toBe(40)
    expect(evaluateLength('max(10vw, 40px)', context)).toBe(100)
    expect(evaluateLength('clamp(20px, 10vw, 60px)', context)).toBe(60)
    expect(evaluateLength('clamp(20px, 10vw, 600px)', context)).toBe(100)
  })

  it('resolves clamp() the way the spec does when the bounds are inverted', () => {
    // `clamp(a, b, c)` is `max(a, min(b, c))`, so a minimum above the maximum
    // wins. Mirroring the spec is what makes the diagnostic describe the
    // browser's behaviour rather than the author's intent.
    expect(evaluateLength('clamp(80px, 10vw, 40px)', context)).toBe(80)
  })

  it('applies precedence and parentheses rather than folding left to right', () => {
    expect(evaluateLength('calc(2px + 3px * 4)', context)).toBe(14)
    expect(evaluateLength('calc((2px + 3px) * 4)', context)).toBe(20)
    expect(evaluateLength('calc(100px / 4)', context)).toBe(25)
    expect(evaluateLength('calc(10vw - 2rem)', context)).toBe(68)
  })

  it('reads a leading sign as a sign and a spaced one as an operator', () => {
    // CSS tells the two apart by whitespace, and so does this: `-16px` is a
    // negative length, `8px - 16px` is a subtraction, and `calc(8px - -16px)`
    // is a subtraction whose right operand is negative.
    expect(evaluateLength('-16px', context)).toBe(-16)
    expect(evaluateLength('+16px', context)).toBe(16)
    expect(evaluateLength('calc(8px - 16px)', context)).toBe(-8)
    expect(evaluateLength('calc(8px - -16px)', context)).toBe(24)
    expect(evaluateLength('calc(-2 * 8px)', context)).toBe(-16)
    expect(evaluateLength('calc(--8px)', context)).toBe(8)
    expect(evaluateLength('calc(+ 8px)', context)).toBe(8)
  })

  it('returns null for anything outside the supported subset', () => {
    // Not zero, and not a guess. A diagnostic built on an invented number
    // reports a cascade that never happens, which is worse than reporting none.
    expect(evaluateLength('var(--gap)', context)).toBeNull()
    expect(evaluateLength('env(safe-area-inset-bottom)', context)).toBeNull()
    expect(evaluateLength('50%', context)).toBeNull()
    expect(evaluateLength('10cqi', context)).toBeNull()
    expect(evaluateLength('solid', context)).toBeNull()
    expect(evaluateLength('#fff', context)).toBeNull()
    expect(evaluateLength('', context)).toBeNull()
  })

  it('returns null for an expression it cannot finish parsing', () => {
    expect(evaluateLength('calc(16px', context)).toBeNull()
    expect(evaluateLength('calc(16px +', context)).toBeNull()
    expect(evaluateLength('calc(16px +)', context)).toBeNull()
    expect(evaluateLength('calc(16px *)', context)).toBeNull()
    expect(evaluateLength('(16px + 8px', context)).toBeNull()
    expect(evaluateLength('calc(+)', context)).toBeNull()
    expect(evaluateLength('calc(, 16px)', context)).toBeNull()
    expect(evaluateLength('calc(16px 32px)', context)).toBeNull()
    expect(evaluateLength('16px 32px', context)).toBeNull()
    expect(evaluateLength('calc()', context)).toBeNull()
    expect(evaluateLength('calc(16px, 32px)', context)).toBeNull()
  })

  it('returns null for a function it does not implement', () => {
    // `round()` and `clamp()` are both plausible in a compiled stylesheet; only
    // one of them has a defined answer here, and the other must not get a
    // wrong one.
    expect(evaluateLength('round(10vw, 8px)', context)).toBeNull()
    expect(evaluateLength('minmax(10px, 20px)', context)).toBeNull()
    expect(evaluateLength('calc(round(10vw, 8px) + 2px)', context)).toBeNull()
  })

  it('returns null rather than infinity when a division has no answer', () => {
    expect(evaluateLength('calc(16px / 0)', context)).toBeNull()
  })
})

describe('splitComponents', () => {
  it('keeps a bracketed group together', () => {
    // Whitespace inside the brackets survives: the group is handed on to be
    // evaluated, not rewritten, and the evaluator reads it as authored.
    expect(splitComponents('clamp(1px, 2vw, 3px) 4px')).toEqual(['clamp(1px, 2vw, 3px)', '4px'])
    expect(splitComponents('16px')).toEqual(['16px'])
    expect(splitComponents('  8px   16px  ')).toEqual(['8px', '16px'])
  })
})
