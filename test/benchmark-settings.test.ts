import { describe, expect, it } from 'vitest'
import { benchmarkSettings } from '../bench/settings.js'

describe('benchmark settings', () => {
  it('keeps both settings optional', () => {
    expect(benchmarkSettings({})).toEqual({ iterations: 20, warmup: 5 })
  })

  it('allows a single measurement and explicitly disabled warmup', () => {
    expect(benchmarkSettings({ BENCH_ITERATIONS: '1', BENCH_WARMUP: '0' })).toEqual({
      iterations: 1,
      warmup: 0,
    })
  })

  it.each(['', ' ', '-1', '1.5', 'NaN', 'Infinity', '1e2', '9007199254740992'])(
    'rejects invalid counts %j in either setting',
    (value) => {
      expect(() => benchmarkSettings({ BENCH_ITERATIONS: value })).toThrow('BENCH_ITERATIONS')
      expect(() => benchmarkSettings({ BENCH_WARMUP: value })).toThrow('BENCH_WARMUP')
    },
  )

  it('requires at least one timed iteration', () => {
    expect(() => benchmarkSettings({ BENCH_ITERATIONS: '0' })).toThrow('BENCH_ITERATIONS')
  })
})
