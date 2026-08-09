import valueParser, { type Node } from 'postcss-value-parser'
import type {
  AdaptiveProfile,
  OutputStrategy,
  ProfileContext,
  ResolvedAdaptiveMatrixOptions,
  ScaleUnit,
} from './types.js'

const SKIPPED_FUNCTIONS = new Set(['url', 'local', 'format'])

/** The three functions whose whole purpose is to bound a fluid value. */
const BOUNDING_FUNCTIONS = new Set(['clamp', 'min', 'max'])

/** A number carrying any viewport- or container-relative unit. */
const VIEWPORT_RELATIVE =
  /(?:^|[^\w.-])-?(?:\d*\.\d+|\d+\.?\d*)(?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))(?![\w-])/i

/**
 * The unit pattern depends only on `unitToConvert`, so it is built once per
 * distinct unit instead of once per declaration.
 *
 * Safe to share: `String#replace` with a global regex resets `lastIndex`.
 */
const UNIT_PATTERNS = new Map<string, RegExp>()

function unitPattern(unit: string): RegExp {
  const cached = UNIT_PATTERNS.get(unit)
  if (cached) return cached
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(^|[^a-zA-Z0-9_.-])(-?(?:\\d*\\.\\d+|\\d+\\.?\\d*))${escaped}(?![a-zA-Z0-9_-])`,
    'gi',
  )
  UNIT_PATTERNS.set(unit, pattern)
  return pattern
}

/**
 * Case-insensitive substring test that allocates nothing.
 *
 * This runs on every declaration in the stylesheet, most of which contain no
 * convertible length at all, so lowercasing a copy of each value would be the
 * single largest source of garbage in the transform.
 */
export function containsIgnoreCase(haystack: string, needleLower: string): boolean {
  const limit = haystack.length - needleLower.length
  if (limit < 0) return false

  const first = needleLower.charCodeAt(0)
  const firstUpper = first >= 97 && first <= 122 ? first - 32 : first

  for (let index = 0; index <= limit; index += 1) {
    const head = haystack.charCodeAt(index)
    if (head !== first && head !== firstUpper) continue

    let matched = true
    for (let offset = 1; offset < needleLower.length; offset += 1) {
      const code = haystack.charCodeAt(index + offset)
      const lowered = code >= 65 && code <= 90 ? code + 32 : code
      if (lowered !== needleLower.charCodeAt(offset)) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

export function round(value: number, precision: number): number {
  const factor = 10 ** precision
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

function format(value: number, precision: number): string {
  return String(round(value, precision))
}

export function resolveDesignWidth(
  profileName: string,
  profile: AdaptiveProfile,
  file: string,
): number {
  const context: ProfileContext = { file, profile: profileName }
  const width =
    typeof profile.designWidth === 'function'
      ? profile.designWidth(context)
      : profile.designWidth
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(
      `[postcss-adaptive-matrix] Profile "${profileName}" returned an invalid designWidth. Expected a positive finite number.`,
    )
  }
  return width
}

/**
 * True when `segment` appears in `name` bounded by hyphens on both sides.
 *
 * Bounded rather than plain containment so `--gap-size` is not read as a
 * `font-size`, and positional rather than suffix-only because token names put
 * the scale step last: both `--van-font-size-md` and `--van-cell-font-size`
 * describe type.
 */
function hasSegment(name: string, segment: string): boolean {
  let from = 0
  for (;;) {
    const index = name.indexOf(segment, from)
    if (index === -1) return false
    const before = index === 0 ? '-' : name[index - 1]
    const after = name[index + segment.length] ?? '-'
    if (before === '-' && after === '-') return true
    from = index + 1
  }
}

export function isAccessibleTextProperty(
  property: string,
  options: ResolvedAdaptiveMatrixOptions,
): boolean {
  // A custom property is named, not standardised, so its meaning lives inside
  // the name. Libraries theme their typography through tokens like
  // `--van-font-size-md`; treating those as plain lengths would emit pure `vw`
  // text that no longer answers to browser zoom.
  const isToken = property.startsWith('--')
  return options.textProperties.some((candidate) => {
    if (candidate.endsWith('*')) {
      const prefix = candidate.slice(0, -1)
      return property.startsWith(prefix) || (isToken && hasSegment(property, prefix))
    }
    return candidate === property || (isToken && hasSegment(property, candidate))
  })
}

function preferredValue(
  pixels: number,
  designWidth: number,
  fluidity: number,
  unit: ScaleUnit,
  accessibleText: boolean,
  precision: number,
): string {
  const fluidPart = format((pixels * fluidity * 100) / designWidth, precision)
  const staticPixels = pixels * (1 - fluidity)
  if (Math.abs(staticPixels) < 10 ** -precision) return `${fluidPart}${unit}`
  const staticPart = accessibleText
    ? `${format(staticPixels / 16, precision)}rem`
    : `${format(staticPixels, precision)}px`
  // A zero fluid term would only add `calc(x + 0vw)` noise around a static length.
  if (Number(fluidPart) === 0) return staticPart
  const operator = Number(fluidPart) < 0 ? '-' : '+'
  return `calc(${staticPart} ${operator} ${format(Math.abs(Number(fluidPart)), precision)}${unit})`
}

function boundaryValue(
  pixels: number,
  designWidth: number,
  fluidity: number,
  width: number,
): number {
  return pixels * (1 - fluidity) + (pixels * fluidity * width) / designWidth
}

/** Conversion of a single length, with the design canvas already resolved. */
function convertResolvedLength(
  pixels: number,
  designWidth: number,
  accessibleText: boolean,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
): string {
  if (!Number.isFinite(pixels)) return `${pixels}${options.unitToConvert}`
  if (pixels === 0 || Math.abs(pixels) < options.minPixelValue) {
    return `${format(pixels, options.precision)}${options.unitToConvert}`
  }
  if (options.hairline > 0 && Math.abs(pixels) <= options.hairline) {
    return `${format(pixels, options.precision)}${options.unitToConvert}`
  }

  const unit = profile.unit ?? options.unit
  const strategy: OutputStrategy = profile.strategy ?? options.strategy
  if (strategy === 'viewport') {
    return `${format((pixels * 100) / designWidth, options.precision)}${unit}`
  }

  const fluidity = accessibleText
    ? (profile.fontFluidity ?? options.fontFluidity)
    : 1
  const start = boundaryValue(pixels, designWidth, fluidity, profile.fluid.minWidth)
  const end = boundaryValue(pixels, designWidth, fluidity, profile.fluid.maxWidth)
  const boundaryUnit = accessibleText ? 'rem' : 'px'
  const divisor = accessibleText ? 16 : 1
  const lowerBound = format(Math.min(start, end) / divisor, options.precision)
  const upperBound = format(Math.max(start, end) / divisor, options.precision)
  // Nothing can move between identical bounds, so a clamp() would be dead weight.
  if (lowerBound === upperBound) return `${lowerBound}${boundaryUnit}`

  const preferred = preferredValue(
    pixels,
    designWidth,
    fluidity,
    unit,
    accessibleText,
    options.precision,
  )
  return `clamp(${lowerBound}${boundaryUnit}, ${preferred}, ${upperBound}${boundaryUnit})`
}

export function convertLength(
  pixels: number,
  property: string,
  profileName: string,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  file: string,
): string {
  return convertResolvedLength(
    pixels,
    resolveDesignWidth(profileName, profile, file),
    isAccessibleTextProperty(property, options),
    profile,
    options,
  )
}

function shouldSkipFunction(node: Node): boolean {
  return (
    node.type === 'function' && SKIPPED_FUNCTIONS.has(node.value.toLowerCase())
  )
}

/**
 * True for a `clamp()`/`min()`/`max()` that already carries a viewport-relative
 * term.
 *
 * Such an expression is bounded fluid sizing somebody already wrote — by hand,
 * or by an earlier pass of this plugin over the same stylesheet. Its pixel
 * terms are that expression's own bounds rather than measurements taken off a
 * design canvas, so converting them would nest one conversion inside another
 * and scale the value twice.
 *
 * Deliberately limited to the three bounding functions. `calc(100vw - 32px)`
 * keeps converting, because there the pixel term really is a design
 * measurement that happens to sit next to a viewport unit.
 */
function isAlreadyBounded(node: Node): boolean {
  if (node.type !== 'function') return false
  if (!BOUNDING_FUNCTIONS.has(node.value.toLowerCase())) return false
  return VIEWPORT_RELATIVE.test(valueParser.stringify(node.nodes))
}

function convertResolvedValue(
  value: string,
  designWidth: number,
  accessibleText: boolean,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
): string {
  const pattern = unitPattern(options.unitToConvert)
  const parsed = valueParser(value)
  parsed.walk((node) => {
    if (shouldSkipFunction(node) || isAlreadyBounded(node)) return false
    if (node.type !== 'word') return undefined
    node.value = node.value.replace(pattern, (match, prefix: string, number: string) => {
      const pixels = Number.parseFloat(number)
      if (
        pixels === 0 ||
        Math.abs(pixels) < options.minPixelValue ||
        (options.hairline > 0 && Math.abs(pixels) <= options.hairline)
      ) {
        return match
      }
      const converted = convertResolvedLength(
        pixels,
        designWidth,
        accessibleText,
        profile,
        options,
      )
      return `${prefix}${converted}`
    })
    return undefined
  })
  return parsed.toString()
}

export function convertValue(
  value: string,
  property: string,
  profileName: string,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  file: string,
): string {
  return convertResolvedValue(
    value,
    resolveDesignWidth(profileName, profile, file),
    isAccessibleTextProperty(property, options),
    profile,
    options,
  )
}

/** Cleared wholesale rather than evicted; the point is a ceiling, not a policy. */
const MAX_CACHE_ENTRIES = 20_000

/**
 * A converter bound to one set of options, memoised across declarations.
 *
 * Design systems reuse a small set of lengths thousands of times, so the same
 * `(canvas, text-ness, value)` triple recurs constantly. Keying on the resolved
 * design width rather than on the file lets stylesheets that share a canvas
 * share cache entries too.
 */
export function createConverter(options: ResolvedAdaptiveMatrixOptions) {
  const unitLower = options.unitToConvert.toLowerCase()
  const widths = new Map<string, number>()
  const textProperties = new Map<string, boolean>()
  const values = new Map<string, string>()

  return {
    /**
     * Drops per-file memoisation before a stylesheet is processed.
     *
     * A functional `designWidth` may legitimately return something new for the
     * same path on a rebuild, so its result must not outlive one pass. The
     * value cache is keyed on the resolved width, so it stays correct either way.
     */
    beginFile(): void {
      widths.clear()
    },

    /** Cheap rejection for declarations that cannot contain a convertible length. */
    mightContainUnit(value: string): boolean {
      return containsIgnoreCase(value, unitLower)
    },

    convert(
      value: string,
      property: string,
      profileName: string,
      profile: AdaptiveProfile,
      file: string,
    ): string {
      const widthKey = `${profileName} ${file}`
      let designWidth = widths.get(widthKey)
      if (designWidth === undefined) {
        designWidth = resolveDesignWidth(profileName, profile, file)
        widths.set(widthKey, designWidth)
      }

      let accessibleText = textProperties.get(property)
      if (accessibleText === undefined) {
        accessibleText = isAccessibleTextProperty(property, options)
        textProperties.set(property, accessibleText)
      }

      const key = `${profileName} ${designWidth} ${accessibleText ? 1 : 0} ${value}`
      const cached = values.get(key)
      if (cached !== undefined) return cached

      const converted = convertResolvedValue(
        value,
        designWidth,
        accessibleText,
        profile,
        options,
      )
      if (values.size >= MAX_CACHE_ENTRIES) values.clear()
      values.set(key, converted)
      return converted
    },
  }
}

export type Converter = ReturnType<typeof createConverter>
