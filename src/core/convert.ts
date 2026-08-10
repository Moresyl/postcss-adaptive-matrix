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

/**
 * A CSS `<number>`: optional sign, digits with an optional fraction, and an
 * optional exponent.
 *
 * The exponent is the part that is easy to leave out, and both places this
 * pattern is used get it wrong without it. `1e2px` is an ordinary hundred
 * pixels — CSS has allowed scientific notation in numbers since Values 3, and
 * generated stylesheets emit it — but a mantissa-only pattern cannot start
 * matching mid-token, so the length is silently left unconverted. The same gap
 * makes `min(1e2vw, 50px)` look free of viewport units, which defeats the
 * idempotence guard and rescales a value the author had already bounded.
 */
const NUMBER = String.raw`-?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?`

/** A number carrying any viewport- or container-relative unit. */
const VIEWPORT_RELATIVE = new RegExp(
  `(?:^|[^\\w.-])${NUMBER}(?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))(?![\\w-])`,
  'i',
)

/**
 * The unit pattern depends only on `unitToConvert`, so it is built once per
 * distinct unit instead of once per declaration.
 *
 * Safe to share: `String#replace` with a global regex resets `lastIndex`.
 */
const UNIT_PATTERNS = new Map<string, RegExp>()

function unitPattern(units: string[]): RegExp {
  const key = units.join('|')
  const cached = UNIT_PATTERNS.get(key)
  if (cached) return cached
  const escaped = units
    .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  // The unit is captured, not just matched: reading several units at once means
  // each match has to say which one it was, both to know its pixel size and to
  // put it back unchanged when a guard declines the conversion.
  const pattern = new RegExp(
    `(^|[^a-zA-Z0-9_.-])(${NUMBER})(${escaped})(?![a-zA-Z0-9_-])`,
    'gi',
  )
  UNIT_PATTERNS.set(key, pattern)
  return pattern
}

/**
 * Pixels per authored unit.
 *
 * Only `rem` has an answer here. `em` is left at face value on purpose: it
 * resolves against whatever font size the element inherited, which is a runtime
 * fact no build-time constant can stand in for, and quietly treating it as
 * `rem` would be wrong wherever the two differ — which is most of a stylesheet.
 */
function unitScale(unit: string, options: ResolvedAdaptiveMatrixOptions): number {
  return unit.length === 3 && unit.toLowerCase() === 'rem' ? options.rootValue : 1
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

function resolveWidth(
  source: number | ((context: ProfileContext) => number),
  profileName: string,
  file: string,
  field: string,
): number {
  const context: ProfileContext = { file, profile: profileName }
  const width = typeof source === 'function' ? source(context) : source
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(
      `[postcss-adaptive-matrix] Profile "${profileName}" returned an invalid ${field}. Expected a positive finite number.`,
    )
  }
  return width
}

export function resolveDesignWidth(
  profileName: string,
  profile: AdaptiveProfile,
  file: string,
): number {
  return resolveWidth(profile.designWidth, profileName, file, 'designWidth')
}

/** See `AdaptiveProfile.textAnchorWidth`. Falls back to the profile's own canvas. */
export function resolveTextAnchorWidth(
  profileName: string,
  profile: AdaptiveProfile,
  file: string,
): number {
  if (profile.textAnchorWidth === undefined) {
    return resolveDesignWidth(profileName, profile, file)
  }
  return resolveWidth(profile.textAnchorWidth, profileName, file, 'textAnchorWidth')
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
  rootValue: number,
): string {
  const fluidPart = format((pixels * fluidity * 100) / designWidth, precision)
  const staticPixels = pixels * (1 - fluidity)
  if (Math.abs(staticPixels) < 10 ** -precision) return `${fluidPart}${unit}`
  const staticPart = accessibleText
    ? `${format(staticPixels / rootValue, precision)}rem`
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
  anchorWidth: number,
  accessibleText: boolean,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  sourceUnit: string = options.unitToConvert[0]!,
): string {
  if (!Number.isFinite(pixels)) return `${pixels}${sourceUnit}`
  if (pixels === 0 || Math.abs(pixels) < options.minPixelValue) {
    return `${format(pixels, options.precision)}${sourceUnit}`
  }
  if (options.hairline > 0 && Math.abs(pixels) <= options.hairline) {
    return `${format(pixels, options.precision)}${sourceUnit}`
  }

  const unit = profile.unit ?? options.unit
  const strategy: OutputStrategy = profile.strategy ?? options.strategy
  if (strategy === 'viewport') {
    return `${format((pixels * 100) / designWidth, options.precision)}${unit}`
  }

  const fluidity = accessibleText
    ? (profile.fontFluidity ?? options.fontFluidity)
    : 1

  // Restated in the anchor canvas's units, after which the anchor *is* the
  // design width and the two formulas below are the ordinary ones. The fluid
  // term comes out unchanged either way — `scaled * f * 100 / anchorWidth` is
  // `pixels * f * 100 / designWidth` — so only the static half moves. With no
  // static half there is nothing to restate, and skipping the arithmetic keeps
  // a purely fluid length bit-for-bit what it was.
  const anchored = fluidity !== 1 && anchorWidth !== designWidth
  const scaled = anchored ? (pixels * anchorWidth) / designWidth : pixels
  const canvas = anchored ? anchorWidth : designWidth

  const start = boundaryValue(scaled, canvas, fluidity, profile.fluid.minWidth)
  const end = boundaryValue(scaled, canvas, fluidity, profile.fluid.maxWidth)
  const boundaryUnit = accessibleText ? 'rem' : 'px'
  const divisor = accessibleText ? options.rootValue : 1
  const lowerBound = format(Math.min(start, end) / divisor, options.precision)
  const upperBound = format(Math.max(start, end) / divisor, options.precision)
  // Nothing can move between identical bounds, so a clamp() would be dead weight.
  if (lowerBound === upperBound) return `${lowerBound}${boundaryUnit}`

  const preferred = preferredValue(
    scaled,
    canvas,
    fluidity,
    unit,
    accessibleText,
    options.precision,
    options.rootValue,
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
    resolveTextAnchorWidth(profileName, profile, file),
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
  anchorWidth: number,
  accessibleText: boolean,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
): string {
  const pattern = unitPattern(options.unitToConvert)
  const parsed = valueParser(value)
  parsed.walk((node) => {
    if (shouldSkipFunction(node) || isAlreadyBounded(node)) return false
    if (node.type !== 'word') return undefined
    node.value = node.value.replace(
      pattern,
      (match, prefix: string, number: string, unit: string) => {
        // Guarded in pixels, not in authored numbers: `minPixelValue` and
        // `hairline` describe how small a thing is on screen, and `0.0625rem`
        // is the same hairline as `1px` however it was written.
        const pixels = Number.parseFloat(number) * unitScale(unit, options)
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
          anchorWidth,
          accessibleText,
          profile,
          options,
          unit,
        )
        return `${prefix}${converted}`
      },
    )
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
    resolveTextAnchorWidth(profileName, profile, file),
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
  const unitsLower = options.unitToConvert.map((unit) => unit.toLowerCase())
  const widths = new Map<string, [design: number, anchor: number]>()
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
      // Loop rather than `some`, to keep the single-unit case — which is nearly
      // every project, and runs on every declaration — free of a closure.
      for (const unit of unitsLower) {
        if (containsIgnoreCase(value, unit)) return true
      }
      return false
    },

    convert(
      value: string,
      property: string,
      profileName: string,
      profile: AdaptiveProfile,
      file: string,
    ): string {
      const widthKey = `${profileName} ${file}`
      let resolvedWidths = widths.get(widthKey)
      if (resolvedWidths === undefined) {
        resolvedWidths = [
          resolveDesignWidth(profileName, profile, file),
          resolveTextAnchorWidth(profileName, profile, file),
        ]
        widths.set(widthKey, resolvedWidths)
      }
      const [designWidth, anchorWidth] = resolvedWidths

      let accessibleText = textProperties.get(property)
      if (accessibleText === undefined) {
        accessibleText = isAccessibleTextProperty(property, options)
        textProperties.set(property, accessibleText)
      }

      // The anchor belongs in the key alongside the design width: two canvases
      // can agree on the latter and still write text differently.
      const key = `${profileName} ${designWidth} ${anchorWidth} ${accessibleText ? 1 : 0} ${value}`
      const cached = values.get(key)
      if (cached !== undefined) return cached

      const converted = convertResolvedValue(
        value,
        designWidth,
        anchorWidth,
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
