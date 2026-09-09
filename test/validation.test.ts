import { expect, it } from 'vitest'
import { rejectUnknownKeys } from '../src/core/validation.js'

// Independent full-matrix reference: no length pruning or rolling rows.
function referenceDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  )
  for (let i = 0; i <= left.length; i++) rows[i]![0] = i
  for (let j = 0; j <= right.length; j++) rows[0]![j] = j
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + Number(left[i - 1] !== right[j - 1]),
      )
    }
  }
  return rows[left.length]![right.length]!
}

it('matches an unpruned reference for casing, ties and threshold boundaries', () => {
  const candidates = ['ab', 'ba', 'abcdefgh', 'abcdefghij', 'i\u0307x', 'WIDTH']
  const keys = ['', 'AB', 'bb', 'İx', 'width', 'abcdefghijklm', 'abcdefghijklmno']
  for (let length = 1; length <= 12; length++) {
    keys.push('a'.repeat(length), 'ab'.repeat(length))
  }
  for (const allowed of [candidates, [...candidates].reverse(), []]) {
    for (const key of keys) {
      if (allowed.includes(key)) continue
      const ranked = allowed
        .map((candidate) => ({
          candidate,
          distance: referenceDistance(key.toLowerCase(), candidate.toLowerCase()),
        }))
        .sort((left, right) => left.distance - right.distance)
      const first = ranked[0]
      const expected =
        first && first.distance <= (key.length >= 10 ? 3 : 2)
          ? ` Did you mean "${first.candidate}"?`
          : ''
      expect(() => rejectUnknownKeys('options', { [key]: true }, allowed)).toThrow(
        new TypeError(
          `[postcss-adaptive-matrix] options.${key} is not a supported configuration field.${expected}`,
        ),
      )
    }
  }
})

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
