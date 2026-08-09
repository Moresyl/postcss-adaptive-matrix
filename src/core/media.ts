/**
 * The sliver of media-query syntax the diagnostics can reason about: plain
 * pixel width bounds joined by `and`.
 *
 * Anything richer — a comma, `not`, `only`, a non-width feature — is reported
 * as unreadable rather than approximated. A diagnostic that treats a condition
 * it cannot parse as "always true" invents cascades that never happen.
 */

const WIDTH_FEATURE = /^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/
/** Media types that describe a screen; anything else is not our business. */
const SCREEN_TYPES = new Set(['screen', 'all'])

/**
 * Splits a media query's params on `and`, returning `null` for anything the
 * rules above exclude.
 */
export function widthConditions(params: string): string[] | null {
  if (/[,]|\bnot\b|\bonly\b/i.test(params)) return null
  const parts = params.split(/\s+and\s+/i).map((part) => part.trim())
  const conditions: string[] = []
  for (const part of parts) {
    if (SCREEN_TYPES.has(part.toLowerCase())) continue
    if (!WIDTH_FEATURE.test(part)) return null
    conditions.push(part)
  }
  return conditions
}

export function matches(condition: string, width: number): boolean {
  const parsed = WIDTH_FEATURE.exec(condition)
  if (!parsed) return false
  const bound = Number(parsed[2])
  return parsed[1] === 'min' ? width >= bound : width <= bound
}

export function boundaryOf(condition: string): number | null {
  const parsed = WIDTH_FEATURE.exec(condition)
  return parsed ? Number(parsed[2]) : null
}

/** True when every condition in the list holds at `width`. */
export function allMatch(conditions: readonly string[], width: number): boolean {
  return conditions.every((condition) => matches(condition, width))
}
