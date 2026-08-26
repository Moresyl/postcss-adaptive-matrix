export function valueKind(value: unknown): string {
  if (value instanceof RegExp) return 'a regular expression'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof RegExp)
  )
}

/** A configuration record, excluding Date/Map/Promise/class instances. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false
  const prototype = Object.getPrototypeOf(value) as { constructor?: { name?: unknown } } | null
  // Constructor-name comparison keeps ordinary records from another realm
  // usable while rejecting host/exotic objects whose enumerable surface would
  // otherwise look exactly like an empty configuration.
  return prototype === null || prototype.constructor?.name === 'Object'
}

export function requireFileMatchers(name: string, value: unknown): void {
  const entries = Array.isArray(value) ? value : [value]
  if (!entries.length) {
    throw new TypeError(`[postcss-adaptive-matrix] ${name} cannot be an empty array.`)
  }
  for (const [index, entry] of entries.entries()) {
    if (typeof entry !== 'string' && !(entry instanceof RegExp) && typeof entry !== 'function') {
      const path = entries.length === 1 ? name : `${name}[${index}]`
      throw new TypeError(
        `[postcss-adaptive-matrix] ${path} must be a string, regular expression or predicate function, not ${valueKind(entry)}.`,
      )
    }
    if (typeof entry === 'string' && !entry.trim()) {
      const path = entries.length === 1 ? name : `${name}[${index}]`
      throw new TypeError(`[postcss-adaptive-matrix] ${path} cannot be empty.`)
    }
  }
}

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
