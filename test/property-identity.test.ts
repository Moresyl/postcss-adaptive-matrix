import { describe, expect, it } from 'vitest'
import { canonicalCssPropertyName } from '../src/core/syntax.js'

describe('canonical CSS property identity', () => {
  it('folds every ASCII uppercase letter, including escaped spelling', () => {
    for (let code = 65; code <= 90; code++) {
      const upper = String.fromCharCode(code)
      const lower = String.fromCharCode(code + 32)
      for (const spelling of [upper, `\\${code.toString(16)} `]) {
        expect(canonicalCssPropertyName(`x-${spelling}-size`)).toBe(`x-${lower}-size`)
      }
    }
  })

  it.each([
    ['font-size', 'font-size'],
    ['FONT-SIZE', 'font-size'],
    ['Ä-SIZE', 'Ä-size'],
    ['İ-SIZE', 'İ-size'],
    ['--Theme-SIZE', '--Theme-SIZE'],
    [String.raw`\2d \2d Theme-SIZE`, '--Theme-SIZE'],
    [String.raw`--\54 heme-SIZE`, '--Theme-SIZE'],
    [String.raw`\46 ONT-size`, 'font-size'],
  ])('preserves the identity of %s', (source, expected) => {
    const actual = canonicalCssPropertyName(source)
    expect(actual).toBe(expected)
    expect(canonicalCssPropertyName(actual)).toBe(actual)
  })
})
