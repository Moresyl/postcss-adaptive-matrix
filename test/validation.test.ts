import { expect, it } from 'vitest'
import { rejectUnknownKeys } from '../src/core/validation.js'

it('rejects very long unknown keys without unrelated spelling suggestions', () => {
  const key = 'x'.repeat(100_000)
  expect(() => rejectUnknownKeys('options', { [key]: true }, ['width', 'height'])).toThrow(
    `[postcss-adaptive-matrix] options.${key} is not a supported configuration field.`,
  )
})

it.each([
  ['widt', ['height', 'width'], 'width'],
  ['minPixeValue', ['precision', 'minPixelValue'], 'minPixelValue'],
  ['WIDTH', ['width'], 'width'],
  ['abcde', ['abc'], 'abc'],
  ['abcdefghij', ['abcdefg'], 'abcdefg'],
])('retains reachable spelling suggestions for %s', (key, allowed, expected) => {
  expect(() => rejectUnknownKeys('options', { [key]: true }, allowed)).toThrow(
    `Did you mean "${expected}"?`,
  )
})
