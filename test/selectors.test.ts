import { describe, expect, it } from 'vitest'
import {
  compareSpecificity,
  formatSpecificity,
  nestedSelectorLists,
  routingSelector,
  specificity,
  splitIsSpecificityNeutral,
  splitSelectorList,
} from '../src/core/selectors.js'

describe('splitSelectorList', () => {
  it('splits on top-level commas only', () => {
    expect(splitSelectorList('.a, .b')).toEqual(['.a', '.b'])
    expect(splitSelectorList(':is(.a, .b)')).toEqual([':is(.a, .b)'])
    expect(splitSelectorList('[title="a,b"]')).toEqual(['[title="a,b"]'])
  })

  it('does not lose its depth count to a bracket inside a string', () => {
    // The obvious implementation counts every `)` it sees, so the one in this
    // attribute value closes a paren that was never opened and the following
    // comma reads as top level. The rule then looks like two selectors.
    expect(splitSelectorList('[data-x="a)b"], .c')).toEqual(['[data-x="a)b"]', '.c'])
    expect(splitSelectorList(':is(.a, [t="("]) .b')).toEqual([':is(.a, [t="("]) .b'])
  })

  it('drops empty branches from a trailing or doubled comma', () => {
    expect(splitSelectorList('.a, , .b,')).toEqual(['.a', '.b'])
  })
})

describe('routingSelector', () => {
  it('empties the arguments that name a different element', () => {
    // `.page-hero:not(.van-cell)` matches no Vant component at all — routing it
    // by the `.van-` in its text sends the whole rule to the wrong canvas.
    expect(routingSelector('.page-hero:not(.van-cell)')).toBe('.page-hero:not()')
    expect(routingSelector('.card:has(> .van-icon)')).toBe('.card:has()')
  })

  it('keeps the arguments that name the subject itself', () => {
    expect(routingSelector(':is(.van-cell, .page-hero)')).toBe(':is(.van-cell, .page-hero)')
    expect(routingSelector(':where(.van-cell)')).toBe(':where(.van-cell)')
  })

  it('reaches an exclusion nested inside a match', () => {
    expect(routingSelector(':is(.page-hero:not(.van-cell))')).toBe(':is(.page-hero:not())')
  })

  it('leaves an ordinary selector byte-for-byte alone', () => {
    for (const selector of ['.a > .b', 'div[title="x, y"]::before', '.a:hover', '*']) {
      expect(routingSelector(selector)).toBe(selector)
    }
  })

  it('survives an unbalanced or truncated selector without hanging', () => {
    expect(routingSelector(':not(.a')).toBe(':not(.a')
    expect(routingSelector('[title="unterminated')).toBe('[title="unterminated')
  })
})

describe('nestedSelectorLists', () => {
  it('reports lists whose branches are alternatives for the subject', () => {
    expect(nestedSelectorLists(':is(.van-cell, .page-hero)')).toEqual([
      { pseudo: 'is', parts: ['.van-cell', '.page-hero'] },
    ])
  })

  it('ignores lists that name a different element', () => {
    // Both branches are excluded from the match, so neither can make the
    // rule's own canvas ambiguous.
    expect(nestedSelectorLists(':not(.van-cell, .page-hero)')).toEqual([])
    expect(nestedSelectorLists('.a:has(.van-cell, .page-hero)')).toEqual([])
  })

  it('ignores a single-branch argument, which decides nothing', () => {
    expect(nestedSelectorLists(':is(.van-cell)')).toEqual([])
  })

  it('descends into nested matching pseudo-classes', () => {
    expect(nestedSelectorLists(':is(.a, :where(.b, .c))')).toEqual([
      { pseudo: 'is', parts: ['.a', ':where(.b, .c)'] },
      { pseudo: 'where', parts: ['.b', '.c'] },
    ])
  })

  it('understands the prefixed spellings', () => {
    expect(nestedSelectorLists(':-webkit-any(.a, .b)')).toEqual([
      { pseudo: '-webkit-any', parts: ['.a', '.b'] },
    ])
  })
})

describe('specificity', () => {
  const cases: Array<[string, [number, number, number]]> = [
    ['*', [0, 0, 0]],
    ['div', [0, 0, 1]],
    ['.a', [0, 1, 0]],
    ['#a', [1, 0, 0]],
    ['.a.b', [0, 2, 0]],
    ['.a > .b', [0, 2, 0]],
    ['[type="text"]', [0, 1, 0]],
    ['[title="a.b#c"]', [0, 1, 0]],
    ['a:hover', [0, 1, 1]],
    ['::before', [0, 0, 1]],
    [':before', [0, 0, 1]],
    ['li::first-line', [0, 0, 2]],
    [':where(.a, #b)', [0, 0, 0]],
    ['.c:where(#b)', [0, 1, 0]],
    [':is(.a, #b)', [1, 0, 0]],
    [':not(.a, div)', [0, 1, 0]],
    ['div:has(.a)', [0, 1, 1]],
    [':nth-child(2n)', [0, 1, 0]],
    [':nth-child(2n of .item)', [0, 2, 0]],
    [':nth-last-child(1 of #main)', [1, 1, 0]],
    [':is(.van-cell, .page-hero)', [0, 1, 0]],
  ]

  for (const [selector, expected] of cases) {
    it(`reads ${selector} as ${expected.join('-')}`, () => {
      expect(specificity(selector)).toEqual(expected)
    })
  }

  it('counts nothing for a lone punctuation mark', () => {
    expect(specificity('.')).toEqual([0, 0, 0])
    expect(specificity('#')).toEqual([0, 0, 0])
  })

  it('orders the way the cascade does', () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 1, 0], [0, 1, 0])).toBe(0)
    expect(compareSpecificity([0, 0, 1], [0, 1, 0])).toBeLessThan(0)
  })

  it('formats the way the specification writes it', () => {
    expect(formatSpecificity(specificity('#a .b div'))).toBe('1-1-1')
  })
})

describe('splitIsSpecificityNeutral', () => {
  it('is always true for :where(), which contributes nothing', () => {
    expect(
      splitIsSpecificityNeutral({ pseudo: 'where', parts: ['#main', '.hero'] }),
    ).toBe(true)
  })

  it('is true when every branch already weighs the same', () => {
    expect(
      splitIsSpecificityNeutral({ pseudo: 'is', parts: ['.van-cell', '.page-hero'] }),
    ).toBe(true)
  })

  it('is false when the branches differ, because the lower one would drop', () => {
    // `:is(#main, .hero)` matches `.hero` at 1-0-0 today; split out on its own
    // it matches at 0-1-0 and can start losing to rules it used to beat.
    expect(
      splitIsSpecificityNeutral({ pseudo: 'is', parts: ['#main', '.hero'] }),
    ).toBe(false)
  })
})
