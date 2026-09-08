/** Reject invalid benchmark runs instead of turning empty samples into NaN. */
export function benchmarkSettings(env: Record<string, string | undefined>) {
  function count(name: string, fallback: number, minimum: number): number {
    const raw = env[name]
    if (raw === undefined) return fallback
    const value = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}.`)
    }
    return value
  }
  return {
    iterations: count('BENCH_ITERATIONS', 20, 1),
    warmup: count('BENCH_WARMUP', 5, 0),
  }
}
