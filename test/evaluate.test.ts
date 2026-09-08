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
  it('returns unknown for excessive nesting without leaking a stack error', () => {
    const deep = `${'calc('.repeat(10_000)}1px${')'.repeat(10_000)}`
    expect(evaluateLength(deep, context)).toBeNull()
    expect(evaluateLength(`calc(${'- '.repeat(10_000)}1px)`, context)).toBeNull()
    expect(evaluateLength(`${'calc('.repeat(32)}1px${')'.repeat(32)}`, context)).toBe(1)
  })
  it.each(['min', 'max'])(
    'evaluates a wide %s without spreading arguments onto the stack',
    (name) => {
      const values = Array.from({ length: 150_000 }, (_, index) => `${index % 10}px`)
      expect(evaluateLength(`${name}(${values.join(',')})`, context)).toBe(name === 'min' ? 0 : 9)
    },
  )
  it.each(['10vw / 2', '10px + 2px', '(10px)', 'calc(10px) + 2px', '- min(10px, 20px)'])(
    'rejects arithmetic outside a CSS math function: %s',
    (value) => expect(evaluateLength(value, context)).toBeNull(),
  )
  it('resolves the units the compiler emits', () => {
    expect(evaluateLength('16px', context)).toBe(16)
    expect(evaluateLength('0', context)).toBe(0)
    expect(evaluateLength('2rem', context)).toBe(32)
    expect(evaluateLength('10vw', context)).toBe(100)
    expect(evaluateLength('10vi', context)).toBe(100)
    expect(evaluateLength('10vh', context)).toBe(80)
    expect(evaluateLength('10vb', context)).toBe(80)
    expect(evaluateLength('10vmin', context)).toBe(80)
    expect(evaluateLength('10vmax', context)).toBe(100)
  })

  it('does not invent an inherited font size for em', () => {
    expect(evaluateLength('2em', context)).toBeNull()
    expect(evaluateLength('calc(2em + 1px)', context)).toBeNull()
  })

  it('evaluates the functions a compiled length is made of', () => {
    expect(evaluateLength('calc(10vw + 8px)', context)).toBe(108)
    expect(evaluateLength('min(10vw, 40px)', context)).toBe(40)
    expect(evaluateLength('max(10vw, 40px)', context)).toBe(100)
    expect(evaluateLength('clamp(20px, 10vw, 60px)', context)).toBe(60)
    expect(evaluateLength('clamp(20px, 10vw, 600px)', context)).toBe(100)
    expect(evaluateLength('calc(10vw/* fluid */ +\r\n8px)', context)).toBe(108)
  })

  it('evaluates escaped function and unit spellings without creating escaped operators', () => {
    expect(evaluateLength(String.raw`cl\61mp(20p\78, 10v\77, 60px)`, context)).toBe(60)
    expect(evaluateLength(String.raw`c\61lc(10vw + 8px)`, context)).toBe(108)
    expect(evaluateLength(String.raw`x\28 10px)`, context)).toBeNull()
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

  it('requires whitespace around binary plus and minus as CSS calc() does', () => {
    for (const value of [
      'calc(8px+16px)',
      'calc(8px +16px)',
      'calc(8px+ 16px)',
      'calc((8px)- 2px)',
    ]) {
      expect(evaluateLength(value, context), value).toBeNull()
    }
    expect(evaluateLength('calc((8px) - 2px)', context)).toBe(6)
    expect(evaluateLength('calc(8px /* note */ + 2px)', context)).toBe(10)
  })

  it('does not treat Unicode spaces as CSS whitespace', () => {
    expect(evaluateLength('calc(8px\u00a0+\u00a02px)', context)).toBeNull()
    expect(evaluateLength('\u00a016px', context)).toBeNull()
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
    expect(evaluateLength('calc((16px()', context)).toBeNull()
    expect(evaluateLength('min((16px(, 32px)', context)).toBeNull()
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
    expect(evaluateLength('10.', context)).toBeNull()
    expect(evaluateLength('calc(16px /* open)', context)).toBeNull()
  })

  it('tracks number and length dimensions instead of inventing pixels', () => {
    expect(evaluateLength('16', context)).toBeNull()
    expect(evaluateLength('calc(16px + 2)', context)).toBeNull()
    expect(evaluateLength('calc(2px * 8px)', context)).toBeNull()
    expect(evaluateLength('calc(16px / 2px)', context)).toBeNull()
    expect(evaluateLength('min(16px, 2)', context)).toBeNull()
    expect(evaluateLength('clamp(0, 10vw, 100px)', context)).toBeNull()
    expect(evaluateLength('calc(2 * 8px)', context)).toBe(16)
    expect(evaluateLength('calc(8px * 2)', context)).toBe(16)
    expect(evaluateLength('calc(16px / 2)', context)).toBe(8)
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
  it.each<[string, string[]]>([
    [String.raw`c\61 lc(1px + 2px) 4px`, [String.raw`c\61 lc(1px + 2px)`, '4px']],
    [String.raw`10v\77  4px`, [String.raw`10v\77 `, '4px']],
    ['10v\\77\r\n 4px', ['10v\\77\r\n', '4px']],
    [String.raw`name\( 4px`, [String.raw`name\(`, '4px']],
    [String.raw`name\" 4px`, [String.raw`name\"`, '4px']],
    [String.raw`name\ space 4px`, [String.raw`name\ space`, '4px']],
    [String.raw`\000076w 4px`, [String.raw`\000076w`, '4px']],
  ])('preserves escape boundaries in %s', (value, expected) => {
    expect(splitComponents(value)).toEqual(expected)
  })

  it('keeps a bracketed group together', () => {
    // Whitespace inside the brackets survives: the group is handed on to be
    // evaluated, not rewritten, and the evaluator reads it as authored.
    expect(splitComponents('clamp(1px, 2vw, 3px) 4px')).toEqual(['clamp(1px, 2vw, 3px)', '4px'])
    expect(splitComponents('16px')).toEqual(['16px'])
    expect(splitComponents('  8px   16px  ')).toEqual(['8px', '16px'])
    expect(splitComponents('"not a length" [a b] 4px')).toEqual(['"not a length"', '[a b]', '4px'])
    expect(splitComponents('8px/* keep this together */ 16px')).toEqual([
      '8px/* keep this together */',
      '16px',
    ])
    expect(splitComponents('8px\u00a016px')).toEqual(['8px\u00a016px'])
  })

  it('does not split malformed component structure into plausible fragments', () => {
    for (const value of [
      '8px ) 16px',
      '8px [a) 16px',
      '8px calc(1px + 2px',
      '8px "open 16px',
      '8px /* open 16px',
    ]) {
      expect(splitComponents(value), value).toEqual([value])
    }
  })
})
