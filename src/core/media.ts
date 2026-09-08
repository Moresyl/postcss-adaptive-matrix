/**
 * The sliver of media-query syntax the diagnostics can reason about: plain
 * width bounds joined by `and`.
 *
 * Anything richer — a comma, `not`, `only`, or an unsupported non-width
 * feature — is reported as unreadable rather than approximated. Orientation is
 * the one projection-safe exception for width-band routing: it changes which
 * devices apply, not which widths a min/max condition implies. A diagnostic
 * that treats any other unknown condition as "always true" invents cascades
 * that never happen.
 */

import { CSS_NUMBER_SOURCE, canonicalizeCssIdentifierEscapes } from './syntax.js'

const WIDTH_FEATURE = new RegExp(
  `^\\([ \\t\\r\\n\\f]*(min|max)-width[ \\t\\r\\n\\f]*:[ \\t\\r\\n\\f]*(${CSS_NUMBER_SOURCE})(px|r?em)?[ \\t\\r\\n\\f]*\\)$`,
  'i',
)
const LENGTH_SOURCE = `(${CSS_NUMBER_SOURCE})(px|r?em)?`
const WIDTH_FIRST_RANGE = new RegExp(
  `^\\([ \\t\\r\\n\\f]*width[ \\t\\r\\n\\f]*(<=|>=|<|>|=)[ \\t\\r\\n\\f]*${LENGTH_SOURCE}[ \\t\\r\\n\\f]*\\)$`,
  'i',
)
const VALUE_FIRST_RANGE = new RegExp(
  `^\\([ \\t\\r\\n\\f]*${LENGTH_SOURCE}[ \\t\\r\\n\\f]*(<=|>=|<|>|=)[ \\t\\r\\n\\f]*width[ \\t\\r\\n\\f]*\\)$`,
  'i',
)
const CHAINED_RANGE = new RegExp(
  `^\\([ \\t\\r\\n\\f]*${LENGTH_SOURCE}[ \\t\\r\\n\\f]*(<=|>=|<|>)[ \\t\\r\\n\\f]*width[ \\t\\r\\n\\f]*(<=|>=|<|>)[ \\t\\r\\n\\f]*${LENGTH_SOURCE}[ \\t\\r\\n\\f]*\\)$`,
  'i',
)
const ORIENTATION_FEATURE =
  /^\([ \t\r\n\f]*orientation[ \t\r\n\f]*:[ \t\r\n\f]*(?:landscape|portrait)[ \t\r\n\f]*\)$/i
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

interface WidthConstraint {
  side: 'min' | 'max'
  px: number
  strict?: boolean
}

function lengthInPixels(numberText: string, unitText: string | undefined): number | null {
  const number = Number(numberText)
  if (!Number.isFinite(number) || (unitText === undefined && number !== 0)) return null
  const unit = unitText?.toLowerCase()
  const pixels = number * (unit === undefined || unit === 'px' ? 1 : INITIAL_FONT_SIZE)
  return Number.isFinite(pixels) ? pixels : null
}

function constraint(
  side: 'min' | 'max',
  px: number | null,
  strict = false,
): WidthConstraint[] | null {
  return px === null ? null : [{ side, px, strict }]
}

function sidesFor(operator: string, featureFirst: boolean): 'min' | 'max' | 'equal' {
  if (operator === '=') return 'equal'
  const greater = operator.startsWith('>')
  return greater === featureFirst ? 'min' : 'max'
}

/** One traditional or Level 4 range-context width feature. */
function parseFeature(feature: string): WidthConstraint[] | null {
  const legacy = WIDTH_FEATURE.exec(feature)
  if (legacy) {
    return constraint(
      legacy[1]!.toLowerCase() as 'min' | 'max',
      lengthInPixels(legacy[2]!, legacy[3]),
    )
  }

  const widthFirst = WIDTH_FIRST_RANGE.exec(feature)
  if (widthFirst) {
    const px = lengthInPixels(widthFirst[2]!, widthFirst[3])
    const side = sidesFor(widthFirst[1]!, true)
    if (side === 'equal' && px !== null)
      return [
        { side: 'min', px },
        { side: 'max', px },
      ]
    return side === 'equal' ? null : constraint(side, px, widthFirst[1]!.length === 1)
  }

  const valueFirst = VALUE_FIRST_RANGE.exec(feature)
  if (valueFirst) {
    const px = lengthInPixels(valueFirst[1]!, valueFirst[2])
    const side = sidesFor(valueFirst[3]!, false)
    if (side === 'equal' && px !== null)
      return [
        { side: 'min', px },
        { side: 'max', px },
      ]
    return side === 'equal' ? null : constraint(side, px, valueFirst[3]!.length === 1)
  }

  const chained = CHAINED_RANGE.exec(feature)
  if (!chained) return null
  const left = lengthInPixels(chained[1]!, chained[2])
  const right = lengthInPixels(chained[5]!, chained[6])
  if (left === null || right === null) return null
  const leftSide = sidesFor(chained[3]!, false)
  const rightSide = sidesFor(chained[4]!, true)
  // `(400px < width < 1000px)` and its reversed spelling are valid chains;
  // arrows pointing away from/toward width are not one mathematical interval.
  if (leftSide === 'equal' || rightSide === 'equal' || leftSide === rightSide) return null
  return [
    { side: leftSide, px: left, strict: chained[3]!.length === 1 },
    { side: rightSide, px: right, strict: chained[4]!.length === 1 },
  ]
}

/** The bound in pixels, and which side of it the rule is live on. */
function parseCondition(condition: string): WidthConstraint | null {
  const parsed = parseFeature(condition)
  return parsed?.length === 1 ? parsed[0]! : null
}

function withoutComments(params: string): string | null {
  let output = ''
  let cursor = 0
  for (;;) {
    const start = params.indexOf('/*', cursor)
    if (start < 0) return output + params.slice(cursor)
    const end = params.indexOf('*/', start + 2)
    if (end < 0) return null
    output += params.slice(cursor, start) + ' '
    cursor = end + 2
  }
}

function trimCssWhitespace(value: string): string {
  return value.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '')
}

/**
 * Splits a media query's params on `and`, returning `null` for anything the
 * rules above exclude.
 */
function conditionsIn(params: string, projectOrientation: boolean): string[] | null {
  const authored = withoutComments(params)
  const clean = authored === null ? null : canonicalizeCssIdentifierEscapes(authored).text
  if (clean === null || /[,]|\bnot\b|\bonly\b/i.test(clean)) return null
  const parts = clean.split(/[ \t\r\n\f]+and[ \t\r\n\f]+/i).map((part) => trimCssWhitespace(part))
  const conditions: string[] = []
  for (const part of parts) {
    if (SCREEN_TYPES.has(part.toLowerCase())) continue
    // Orientation narrows *which devices* match, never the set of viewport
    // widths at which a width condition can hold. Routing and dead-band checks
    // can therefore project it away safely. Continuity cannot: it compares the
    // winning cascade at one concrete state, and guessing portrait/landscape
    // could compare declarations that never coexist. Its public parser keeps
    // passing `false` and remains deliberately conservative.
    if (projectOrientation && ORIENTATION_FEATURE.test(part)) continue
    const parsed = parseFeature(part)
    if (!parsed) return null
    for (const entry of parsed) {
      conditions.push(
        entry.strict
          ? `(width ${entry.side === 'min' ? '>' : '<'} ${entry.px}px)`
          : `(${entry.side}-width: ${entry.px}px)`,
      )
    }
  }
  return conditions
}

export function widthConditions(params: string): string[] | null {
  return conditionsIn(params, false)
}

export function matches(condition: string, width: number): boolean {
  const parsed = parseCondition(condition)
  if (!parsed) return false
  if (parsed.strict) return parsed.side === 'min' ? width > parsed.px : width < parsed.px
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
  const conditions = conditionsIn(params, true)
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
