/**
 * The sliver of media-query syntax the diagnostics can reason about: plain
 * width bounds joined by `and`.
 *
 * Anything richer — a comma, `not`, `only`, a non-width feature — is reported
 * as unreadable rather than approximated. A diagnostic that treats a condition
 * it cannot parse as "always true" invents cascades that never happen.
 */

const WIDTH_FEATURE = /^\(\s*(min|max)-width\s*:\s*([\d.]+)(px|r?em)\s*\)$/
/** Media types that describe a screen; anything else is not our business. */
const SCREEN_TYPES = new Set(['screen', 'all'])

/**
 * What `1em` and `1rem` are worth inside a media query.
 *
 * Not `rootValue`, and not the root element's font size. Relative units in a
 * media query resolve against the *initial* value of `font-size`, because a
 * query is evaluated before any declaration could change it — so a query cannot
 * depend on the results of the cascade it selects. That makes 16 a fact about
 * the query rather than an assumption about the page, and it is why
 * `@media (min-width: 64rem)` is 1024px even in a stylesheet whose `html` is
 * 62.5%. Utility frameworks write their breakpoints in `rem`, so reading only
 * `px` here would have left every Tailwind and UnoCSS project unreadable.
 */
const INITIAL_FONT_SIZE = 16

/** The bound in pixels, and which side of it the rule is live on. */
function parseCondition(condition: string): { side: 'min' | 'max'; px: number } | null {
  const parsed = WIDTH_FEATURE.exec(condition)
  if (!parsed) return null
  const scale = parsed[3] === 'px' ? 1 : INITIAL_FONT_SIZE
  return { side: parsed[1] as 'min' | 'max', px: Number(parsed[2]) * scale }
}

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
  const parsed = parseCondition(condition)
  if (!parsed) return false
  return parsed.side === 'min' ? width >= parsed.px : width <= parsed.px
}

export function boundaryOf(condition: string): number | null {
  return parseCondition(condition)?.px ?? null
}

/** True when every condition in the list holds at `width`. */
export function allMatch(conditions: readonly string[], width: number): boolean {
  return conditions.every((condition) => matches(condition, width))
}

/**
 * The stretch of viewport widths a rule is live in, in CSS pixels.
 *
 * `hi` is `Infinity` when nothing bounds it above. Outside this band the rule
 * does not apply at all, so it is the only range over which its values need to
 * make sense — and the range a `clamp()` inside it has to actually move across
 * to be doing anything.
 */
export interface WidthBand {
  lo: number
  hi: number
}

/** Every width, which is where a stylesheet starts before any `@media`. */
export const EVERY_WIDTH: WidthBand = { lo: 0, hi: Infinity }

/**
 * The band a media query is live in, or `null` when the query cannot be read.
 *
 * `null` is not "no constraint" — it is "unknown", and callers must treat it as
 * a refusal to answer rather than as `EVERY_WIDTH`. Guessing here would route
 * rules on a condition nobody verified.
 */
export function bandOf(params: string): WidthBand | null {
  const conditions = widthConditions(params)
  if (!conditions) return null
  let { lo, hi } = EVERY_WIDTH
  for (const condition of conditions) {
    // Unreachable: `widthConditions` returned `null` already if any part
    // failed this same pattern. Kept so that the two stay independent — if one
    // is ever loosened, this returns "unknown" rather than a band built from a
    // condition it could not read.
    /* v8 ignore next 2 */
    const parsed = parseCondition(condition)
    if (!parsed) return null
    if (parsed.side === 'min') lo = Math.max(lo, parsed.px)
    else hi = Math.min(hi, parsed.px)
  }
  return { lo, hi }
}

/**
 * Two nested media queries, as one band.
 *
 * Nesting is conjunction: an inner query only ever narrows what the outer one
 * already allowed. An empty result (`lo > hi`) is left as it comes out — a rule
 * that can never apply is the author's to explain, not this function's to hide.
 */
export function narrow(outer: WidthBand, inner: WidthBand): WidthBand {
  return { lo: Math.max(outer.lo, inner.lo), hi: Math.min(outer.hi, inner.hi) }
}
