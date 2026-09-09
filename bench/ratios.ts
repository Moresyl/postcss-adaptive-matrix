/** Negative deltas may be measurement noise; an unusable baseline is not a pass. */
export function relativeAddedCost(total: number, baseline: number, denominator = baseline): number {
  if (
    !Number.isFinite(total) ||
    total < 0 ||
    !Number.isFinite(baseline) ||
    baseline <= 0 ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    throw new RangeError('Relative cost needs a finite nonnegative total and positive baseline.')
  }
  const ratio = (total - baseline) / denominator
  if (!Number.isFinite(ratio)) throw new RangeError('Relative cost overflowed.')
  return ratio
}
