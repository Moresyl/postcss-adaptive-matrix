/** Rotate invocation order so no candidate always runs first or last. */
export async function measureAlternating(
  runs: readonly (() => Promise<unknown>)[],
  iterations: number,
  warmup: number,
  now: () => number = () => performance.now(),
): Promise<number[]> {
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    !Number.isSafeInteger(warmup) ||
    warmup < 0
  ) {
    throw new RangeError('Measurement counts must be safe integers: iterations >= 1, warmup >= 0.')
  }
  if (!runs.length) throw new RangeError('At least one measurement candidate is required.')
  const samples = runs.map(() => [] as number[])
  for (let round = 0; round < warmup + iterations; round++) {
    for (let offset = 0; offset < runs.length; offset++) {
      const index = (round + offset) % runs.length
      const start = now()
      await runs[index]!()
      const duration = now() - start
      if (!Number.isFinite(duration) || duration < 0)
        throw new RangeError('Invalid measurement duration.')
      if (round >= warmup) samples[index]!.push(duration)
    }
  }
  return samples.map((values) => {
    values.sort((a, b) => a - b)
    const middle = values.length >> 1
    return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2
  })
}
