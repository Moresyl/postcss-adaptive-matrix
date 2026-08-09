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
const INSET_PROPERTIES = new Set([
  'left',
  'right',
  'inset-inline-start',
  'inset-inline-end',
])

/** Properties whose `100%` means "the whole viewport" for a fixed element. */
const WIDTH_PROPERTIES = new Set([
  'width',
  'max-width',
  'inline-size',
  'max-inline-size',
])

const ZERO = /^-?0(?:\.0+)?(?:px|rem|em|%|vw|vi|cqw|cqi)?$/i
const FULL_WIDTH = /^100%$/

export function isFixedPositionValue(value: string): boolean {
  return value.trim().toLowerCase() === 'fixed'
}

/**
 * Rewrites one declaration of a fixed-position rule, or returns null to leave
 * it alone.
 *
 * `value` has already been through unit conversion, so this composes with the
 * fluid output rather than replacing it.
 */
export function correctFixedDeclaration(
  property: string,
  value: string,
): string | null {
  const name = property.toLowerCase()

  // Already corrected — re-running the plugin must not stack gutters.
  if (value.includes(ROOT_GUTTER_VARIABLE) || value.includes(ROOT_WIDTH_VARIABLE)) {
    return null
  }

  if (INSET_PROPERTIES.has(name)) {
    const trimmed = value.trim()
    // A bare `0` is the overwhelmingly common case and deserves the short form.
    if (ZERO.test(trimmed)) return GUTTER
    // `auto` has no length to offset, and offsetting it would break the layout.
    if (trimmed.toLowerCase() === 'auto') return null
    return `calc(${trimmed} + ${GUTTER})`
  }

  if (WIDTH_PROPERTIES.has(name) && FULL_WIDTH.test(value.trim())) {
    return `min(100%, ${ROOT_WIDTH})`
  }

  return null
}

/** True when the configuration asks for the correction and can support it. */
export function wantsFixedCorrection(
  options: ResolvedAdaptiveMatrixOptions,
): boolean {
  return Boolean(options.root && options.root.fixedContainingBlock)
}
