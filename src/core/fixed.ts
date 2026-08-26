/**
 * Keeps `position: fixed` inside a centred root column.
 *
 * A constrained root (`max-inline-size` plus `margin-inline: auto`) turns the
 * page into a centred column on wide screens. `position: fixed` ignores that
 * column entirely — it resolves against the viewport — so a bottom tab bar
 * authored as `left: 0; right: 0` stretches the full width of a desktop
 * monitor while the content it belongs to sits in the middle. It is the one
 * defect in this family that is visible to every user rather than subtle.
 *
 * The correction offsets the element by the gutter between the viewport edge
 * and the column. Its safety comes from the gutter collapsing to `0px` as soon
 * as the viewport is narrower than the column, which means the whole mechanism
 * is inert on phones and cannot regress the common case.
 */
import type { ResolvedAdaptiveMatrixOptions } from './types.js'
import { CSS_NUMBER_SOURCE } from './syntax.js'

/** Width of the root column, or `100vw` while it is unconstrained. */
export const ROOT_WIDTH_VARIABLE = '--adaptive-root-width'
/** Distance from a viewport edge to the column edge; `0px` when they coincide. */
export const ROOT_GUTTER_VARIABLE = '--adaptive-root-gutter'

const GUTTER = `var(${ROOT_GUTTER_VARIABLE})`
const ROOT_WIDTH = `var(${ROOT_WIDTH_VARIABLE})`

/**
 * Physical and logical inset properties that move an element horizontally.
 *
 * `top` and `bottom` are absent on purpose: the column constrains the inline
 * axis only, so vertical insets are already correct.
 */
const INSET_PROPERTIES = new Set(['left', 'right', 'inset-inline-start', 'inset-inline-end'])

/** Properties whose `100%` means "the whole viewport" for a fixed element. */
const WIDTH_PROPERTIES = new Set(['width', 'max-width', 'inline-size', 'max-inline-size'])

const CSS_LENGTH_UNIT =
  String.raw`(?:px|cm|mm|q|in|pc|pt|em|ex|cap|ch|ic|rem|lh|rlh|` +
  String.raw`v(?:w|h|i|b|min|max)|[sld]v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))`
const ZERO = new RegExp(`^(${CSS_NUMBER_SOURCE})(?:${CSS_LENGTH_UNIT}|%)?$`, 'i')
const FULL_WIDTH = new RegExp(`^(${CSS_NUMBER_SOURCE})%$`, 'i')
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset'])

/** Reads a single CSS keyword while treating comments as whitespace. */
function singleKeyword(value: string): string | null {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // An unclosed comment makes the rest of the declaration ambiguous. Refuse to
  // reinterpret it as a keyword; malformed authored CSS is not ours to repair.
  if (withoutComments.includes('/*')) return null
  const keyword = withoutComments.trim().toLowerCase()
  return /^[a-z-]+$/.test(keyword) ? keyword : null
}

function equalsNumber(value: string, pattern: RegExp, expected: number): boolean {
  const match = pattern.exec(value)
  return match !== null && Number(match[1]) === expected
}

export function isFixedPositionValue(value: string): boolean {
  return singleKeyword(value) === 'fixed'
}

/**
 * Rewrites one declaration of a fixed-position rule, or returns null to leave
 * it alone.
 *
 * `value` has already been through unit conversion, so this composes with the
 * fluid output rather than replacing it.
 */
export function correctFixedDeclaration(property: string, value: string): string | null {
  const name = property.toLowerCase()

  // Already corrected — re-running the plugin must not stack gutters.
  if (value.includes(ROOT_GUTTER_VARIABLE) || value.includes(ROOT_WIDTH_VARIABLE)) {
    return null
  }

  if (INSET_PROPERTIES.has(name)) {
    const trimmed = value.trim()
    // A bare `0` is the overwhelmingly common case and deserves the short form.
    if (equalsNumber(trimmed, ZERO, 0)) return GUTTER
    // `auto` and CSS-wide keywords have no computable length. Putting one into
    // calc() makes the declaration invalid and changes its fallback behaviour.
    const keyword = singleKeyword(trimmed)
    if (keyword === 'auto' || (keyword !== null && CSS_WIDE_KEYWORDS.has(keyword))) return null
    return `calc(${trimmed} + ${GUTTER})`
  }

  if (WIDTH_PROPERTIES.has(name) && equalsNumber(value.trim(), FULL_WIDTH, 100)) {
    return `min(100%, ${ROOT_WIDTH})`
  }

  return null
}

/** True when the configuration asks for the correction and can support it. */
export function wantsFixedCorrection(options: ResolvedAdaptiveMatrixOptions): boolean {
  return Boolean(options.root && options.root.fixedContainingBlock)
}
