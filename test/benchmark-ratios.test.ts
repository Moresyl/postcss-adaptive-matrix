import { expect, it } from 'vitest'
import { relativeAddedCost } from '../bench/ratios.js'

it('measures added costs with the requested denominator and preserves negative noise', () => {
  expect(relativeAddedCost(15, 10)).toBe(0.5)
  expect(relativeAddedCost(17, 15, 10)).toBe(0.2)
  expect(relativeAddedCost(9, 10)).toBe(-0.1)
})

it.each([0, -1, Infinity, NaN])('rejects unusable baselines or denominators %s', (value) => {
  expect(() => relativeAddedCost(10, value)).toThrow(RangeError)
  expect(() => relativeAddedCost(10, 5, value)).toThrow(RangeError)
})

it.each([-1, Infinity, NaN])('rejects invalid total %s', (value) => {
  expect(() => relativeAddedCost(value, 10)).toThrow(RangeError)
})

it('rejects division overflow instead of producing an infinite budget result', () => {
  expect(() => relativeAddedCost(Number.MAX_VALUE, Number.MIN_VALUE)).toThrow('overflowed')
})
