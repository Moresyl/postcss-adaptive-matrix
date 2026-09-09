import { expect, it } from 'vitest'
import { measureAlternating } from '../bench/alternating.js'

it('rejects an empty candidate list', async () => {
  await expect(measureAlternating([], 1, 0)).rejects.toThrow('At least one')
})

it.each([Number.NaN, Infinity, -1])('rejects invalid measured duration %s', async (duration) => {
  let reads = 0
  await expect(
    measureAlternating([() => Promise.resolve()], 1, 0, () => (reads++ ? duration : 0)),
  ).rejects.toThrow('Invalid measurement duration')
})

it('rejects unsafe combined round counts before invoking a candidate', async () => {
  await expect(
    measureAlternating(
      [() => Promise.reject(new Error('must not run'))],
      Number.MAX_SAFE_INTEGER,
      1,
    ),
  ).rejects.toThrow('Measurement counts')
})

it('rotates all candidates while keeping timing samples with their owner', async () => {
  const order: number[] = []
  let time = 0
  const runs = [2, 4, 8].map((duration, index) => () => {
    order.push(index)
    time += duration
    return Promise.resolve()
  })
  expect(await measureAlternating(runs, 2, 1, () => time)).toEqual([2, 4, 8])
  expect(order).toEqual([0, 1, 2, 1, 2, 0, 2, 0, 1])
})

it('excludes warmup values from the median', async () => {
  let time = 0
  const durations = [1000, 3, 1, 2]
  const run = () => {
    time += durations.shift()!
    return Promise.resolve()
  }
  expect(await measureAlternating([run], 3, 1, () => time)).toEqual([2])
})

it('keeps an even-sample median finite when individual timings are near the limit', async () => {
  let reads = 0
  const readings = [0, Number.MAX_VALUE, 0, Number.MAX_VALUE]
  expect(await measureAlternating([async () => {}], 2, 0, () => readings[reads++]!)).toEqual([
    Number.MAX_VALUE,
  ])
})

it('propagates candidate failures instead of returning partial timings', async () => {
  await expect(
    measureAlternating([() => Promise.reject(new Error('failed'))], 1, 0),
  ).rejects.toThrow('failed')
})

it.each([
  [0, 0],
  [1, -1],
  [1.5, 0],
  [1, Infinity],
])('rejects invalid counts %s/%s', async (iterations, warmup) => {
  await expect(measureAlternating([async () => {}], iterations, warmup)).rejects.toThrow(RangeError)
})
