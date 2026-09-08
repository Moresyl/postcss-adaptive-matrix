import { expect, it } from 'vitest'
import { measureAlternating } from '../bench/alternating.js'

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
