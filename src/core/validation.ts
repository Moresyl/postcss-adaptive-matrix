/** Levenshtein distance, used only while formatting a configuration error. */
function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]!
}

function suggestion(key: string, allowed: readonly string[]): string | null {
  let closest: string | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of allowed) {
    const next = editDistance(key.toLowerCase(), candidate.toLowerCase())
    if (next < distance) {
      closest = candidate
      distance = next
    }
  }
  // Two edits catches a missing letter and a transposition without pretending
  // an unrelated setting was meant. Longer names can survive one extra typo.
  const threshold = key.length >= 10 ? 3 : 2
  return distance <= threshold ? closest : null
}

/**
 * Rejects properties that TypeScript and the published JSON Schema would.
 *
 * JavaScript configuration has neither of those guards. Spreading an unknown
 * key into the resolved options silently made a misspelling look accepted, so
 * runtime validation must close the same object at every nesting level.
 */
export function rejectUnknownKeys(path: string, value: object, allowed: readonly string[]): void {
  const known = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (known.has(key)) continue
    const guessed = suggestion(key, allowed)
    throw new TypeError(
      `[postcss-adaptive-matrix] ${path}.${key} is not a supported configuration field.` +
        (guessed ? ` Did you mean "${guessed}"?` : ''),
    )
  }
}
