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
import { splitComponents } from './evaluate.js'

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

function correctInlineInset(value: string): string {
  const trimmed = value.trim()
  if (trimmed.includes(ROOT_GUTTER_VARIABLE) || trimmed.includes(ROOT_WIDTH_VARIABLE)) {
    return trimmed
  }
  if (equalsNumber(trimmed, ZERO, 0)) return GUTTER
  const keyword = singleKeyword(trimmed)
  if (keyword === 'auto' || (keyword !== null && CSS_WIDE_KEYWORDS.has(keyword))) return trimmed
  return `calc(${trimmed} + ${GUTTER})`
}

function correctInsetShorthand(value: string, inlineOnly: boolean): string | null {
  const parts = splitComponents(value)
  const limit = inlineOnly ? 2 : 4
  if (!parts.length || parts.length > limit) return null
  // CSS-wide keywords are valid only as the whole shorthand. They cannot be
  // expanded alongside another component, and have no numeric inline offset.
  if (parts.some((part) => CSS_WIDE_KEYWORDS.has(singleKeyword(part) ?? ''))) return null

  const corrected = [...parts]
  if (inlineOnly) {
    for (let index = 0; index < corrected.length; index += 1) {
      corrected[index] = correctInlineInset(corrected[index]!)
    }
  } else if (corrected.length === 1) {
    // One inset value applies to all four edges. Expand to vertical/horizontal
    // so only the inline axis receives the centred-column gutter.
    const inline = correctInlineInset(corrected[0]!)
    if (inline === corrected[0]) return null
    corrected.push(inline)
  } else {
    // In the 2/3/4-value grammar the second component is right; the fourth,
    // when present, is left. The block-axis values stay authored.
    corrected[1] = correctInlineInset(corrected[1]!)
    if (corrected.length === 4) corrected[3] = correctInlineInset(corrected[3]!)
  }
  const result = corrected.join(' ')
  return result === parts.join(' ') ? null : result
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

  if (INSET_PROPERTIES.has(name)) {
    const corrected = correctInlineInset(value)
    return corrected === value.trim() ? null : corrected
  }

  if (name === 'inset-inline') return correctInsetShorthand(value, true)
  if (name === 'inset') return correctInsetShorthand(value, false)

  if (
    WIDTH_PROPERTIES.has(name) &&
    !value.includes(ROOT_WIDTH_VARIABLE) &&
    equalsNumber(value.trim(), FULL_WIDTH, 100)
  ) {
    return `min(100%, ${ROOT_WIDTH})`
  }

  return null
}

/** True when the configuration asks for the correction and can support it. */
export function wantsFixedCorrection(options: ResolvedAdaptiveMatrixOptions): boolean {
  return Boolean(options.root && options.root.fixedContainingBlock)
}
