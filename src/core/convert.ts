import valueParser, { type Node } from 'postcss-value-parser'
import type {
  AdaptiveProfile,
  OutputStrategy,
  ProfileContext,
  ResolvedAdaptiveMatrixOptions,
  ScaleUnit,
} from './types.js'
import {
  CSS_NUMBER_SOURCE,
  canonicalCssIdentifierName,
  canonicalCssPropertyName,
  canonicalizeCssIdentifierEscapes,
  isCssWhitespace,
} from './syntax.js'

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
/** A number carrying any viewport- or container-relative unit. */
const VIEWPORT_RELATIVE = new RegExp(
  `(?:^|[^\\w.-])${CSS_NUMBER_SOURCE}(?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))(?![\\w-])`,
  'i',
)
const VIEWPORT_RELATIVE_EXACT = new RegExp(
  `^${CSS_NUMBER_SOURCE}(?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))$`,
  'i',
)
const ROOT_RELATIVE = new RegExp(`(?:^|[^\\w.-])${CSS_NUMBER_SOURCE}rem(?![\\w-])`, 'i')
const ROOT_RELATIVE_EXACT = new RegExp(`^${CSS_NUMBER_SOURCE}rem$`, 'i')

/**
 * The unit pattern depends only on `unitToConvert`, so it is built once per
 * distinct unit instead of once per declaration.
 *
 * Safe to share: `String#replace` with a global regex resets `lastIndex`.
 */
const UNIT_PATTERNS = new Map<string, RegExp>()
const IDENT_CONTINUATION_SOURCE = String.raw`A-Za-z0-9_\\\u0080-\uFFFF-`

function unitPattern(units: string[]): RegExp {
  const key = JSON.stringify(units.map((unit) => unit.toLowerCase()))
  const cached = UNIT_PATTERNS.get(key)
  if (cached) return cached
  const escaped = units.map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // The unit is captured, not just matched: reading several units at once means
  // each match has to say which one it was, both to know its pixel size and to
  // put it back unchanged when a guard declines the conversion.
  const pattern = new RegExp(
    `(^|[^.${IDENT_CONTINUATION_SOURCE}])(${CSS_NUMBER_SOURCE})(${escaped})(?![${IDENT_CONTINUATION_SOURCE}])`,
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
function unitScale(unit: string, rootValue: number): number {
  return unit.length === 3 && unit.toLowerCase() === 'rem' ? rootValue : 1
}

/** Resolves the shared rem ruler for one input file. */
export function resolveRootValue(options: ResolvedAdaptiveMatrixOptions, file: string): number {
  const source = options.rootValue
  const value = typeof source === 'function' ? source({ file }) : source
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `[postcss-adaptive-matrix] rootValue for "${file || '<unknown>'}" returned an invalid value. Expected a positive finite number.`,
    )
  }
  return value
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
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${profileName}" returned an invalid ${field} for "${file || '<unknown>'}". Expected a positive finite number.`,
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
  designWidth: number = resolveDesignWidth(profileName, profile, file),
): number {
  if (profile.textAnchorWidth === undefined) return designWidth
  return resolveWidth(profile.textAnchorWidth, profileName, file, 'textAnchorWidth')
}

function resolveProfileWidths(
  profileName: string,
  profile: AdaptiveProfile,
  file: string,
): [design: number, anchor: number] {
  const designWidth = resolveDesignWidth(profileName, profile, file)
  return [designWidth, resolveTextAnchorWidth(profileName, profile, file, designWidth)]
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
  // Standard property names are ASCII case-insensitive in CSS, while custom
  // property names are case-sensitive. Preserve the latter and canonicalise
  // the former so `FONT-SIZE` cannot silently lose the zoomable text formula.
  const subject = canonicalCssPropertyName(property)
  const isToken = subject.startsWith('--')
  return options.textProperties.some((candidate) => {
    const pattern = canonicalCssPropertyName(candidate)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return subject.startsWith(prefix) || (isToken && hasSegment(subject, prefix))
    }
    return pattern === subject || (isToken && hasSegment(subject, pattern))
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
  rootValue: number,
  sourceUnit: string = options.unitToConvert[0]!,
): string {
  if (!Number.isFinite(pixels)) {
    throw new RangeError('[postcss-adaptive-matrix] Length value must be a finite number.')
  }
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

  const fluidity = accessibleText ? (profile.fontFluidity ?? options.fontFluidity) : 1

  // Restated in the anchor canvas's units, after which the anchor *is* the
  // design width and the two formulas below are the ordinary ones. The fluid
  // term comes out unchanged either way — `scaled * f * 100 / anchorWidth` is
  // `pixels * f * 100 / designWidth` — so only the static half moves. With no
  // static half there is nothing to restate, and skipping the arithmetic keeps
  // a purely fluid length bit-for-bit what it was.
  const anchored = fluidity !== 1 && anchorWidth !== designWidth
  const scaled = anchored ? (pixels * anchorWidth) / designWidth : pixels
  const canvas = anchored ? anchorWidth : designWidth

  const boundaryUnit = accessibleText ? 'rem' : 'px'
  const divisor = accessibleText ? rootValue : 1
  const preferred = preferredValue(
    scaled,
    canvas,
    fluidity,
    unit,
    accessibleText,
    options.precision,
    rootValue,
  )
  // A function is the structural trace that distinguishes generated output
  // from authored lengths on a later pass and in continuity diagnostics.
  // Hybrid text already has calc(); a bare viewport or static-rem preferred
  // value gets the zero-cost equivalent spelling. This is especially important
  // for a library canvas: without the marker, 2rem can be anchored into 4rem
  // when a consuming build reads the precompiled stylesheet again.
  const compiledPreferred = preferred.startsWith('calc(') ? preferred : `calc(${preferred})`
  if (accessibleText && fluidity === 0) return compiledPreferred
  const { minWidth, maxWidth } = profile.fluid ?? {}
  if (minWidth === undefined && maxWidth === undefined) return compiledPreferred

  const formatBoundary = (width: number): string =>
    `${format(boundaryValue(scaled, canvas, fluidity, width) / divisor, options.precision)}${boundaryUnit}`
  if (minWidth === undefined || maxWidth === undefined) {
    const boundary = formatBoundary(minWidth ?? maxWidth!)
    if (boundary === preferred) return compiledPreferred
    const lowerBounded = minWidth !== undefined
    const fn = lowerBounded === scaled >= 0 ? 'max' : 'min'
    return `${fn}(${preferred}, ${boundary})`
  }

  const start = boundaryValue(scaled, canvas, fluidity, minWidth)
  const end = boundaryValue(scaled, canvas, fluidity, maxWidth)
  const lowerBound = format(Math.min(start, end) / divisor, options.precision)
  const upperBound = format(Math.max(start, end) / divisor, options.precision)
  // Nothing can move between identical bounds, so clamp() would be dead
  // weight. Keep the lightweight function marker: generated output must remain
  // distinguishable from authored pixels/rem on a later pass and at a seam.
  if (lowerBound === upperBound) return `calc(${lowerBound}${boundaryUnit})`
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
  const [designWidth, anchorWidth] = resolveProfileWidths(profileName, profile, file)
  const converted = convertResolvedLength(
    pixels,
    designWidth,
    anchorWidth,
    isAccessibleTextProperty(property, options),
    profile,
    options,
    resolveRootValue(options, file),
  )
  if (converted.includes('Infinity') || converted.includes('NaN')) {
    throw new RangeError(
      '[postcss-adaptive-matrix] Converted length exceeds the finite numeric range.',
    )
  }
  return converted
}

function shouldSkipFunction(node: Node): boolean {
  return node.type === 'function' && SKIPPED_FUNCTIONS.has(canonicalCssIdentifierName(node.value))
}

/** Finds a real length token while ignoring comments, strings and separators. */
function containsRelativeLength(nodes: Node[], pattern: RegExp): boolean {
  return nodes.some((node) => {
    if (node.type === 'word') return pattern.test(node.value)
    return node.type === 'function' && containsRelativeLength(node.nodes, pattern)
  })
}

/**
 * True for a fluid expression that must not be treated as authored design
 * measurements again.
 *
 * Such an expression is bounded fluid sizing somebody already wrote — by hand,
 * or by an earlier pass of this plugin over the same stylesheet. Its pixel
 * terms are that expression's own bounds rather than measurements taken off a
 * design canvas, so converting them would nest one conversion inside another
 * and scale the value twice.
 *
 * Bounding functions are recognised for every property. Unbounded accessible
 * text is recognised too, because `withAtomicCss` reads `rem` and would
 * otherwise scale the generated static half on a second pass. A layout
 * `calc(100vw - 32px)` still converts: its pixel term is a design measurement.
 */
function isAlreadyFluid(node: Node, accessibleText: boolean, staticText: boolean): boolean {
  if (node.type !== 'function') return false
  const hasViewportLength = containsRelativeLength(node.nodes, VIEWPORT_RELATIVE)
  const name = canonicalCssIdentifierName(node.value)
  if (BOUNDING_FUNCTIONS.has(name)) return hasViewportLength
  const isUnboundedMarker =
    name === 'calc' &&
    node.nodes.length === 1 &&
    node.nodes[0]!.type === 'word' &&
    VIEWPORT_RELATIVE_EXACT.test(node.nodes[0]!.value)
  const isStaticTextMarker =
    staticText &&
    name === 'calc' &&
    node.nodes.length === 1 &&
    node.nodes[0]!.type === 'word' &&
    ROOT_RELATIVE_EXACT.test(node.nodes[0]!.value)
  return (
    isUnboundedMarker ||
    isStaticTextMarker ||
    (accessibleText &&
      name === 'calc' &&
      hasViewportLength &&
      containsRelativeLength(node.nodes, ROOT_RELATIVE))
  )
}

/**
 * Whether a value-parser word continues a CSS hex escape from the prior word.
 *
 * In `x\31 6px` the space terminates the escape but is not a token separator:
 * the browser reads one identifier, while value-parser exposes `6px` as a new
 * word. Converting that apparent dimension would mutate an identifier.
 */
function continuesHexEscape(value: string, index: number): boolean {
  if (index === 0 || !isCssWhitespace(value[index - 1]!)) return false
  let cursor = index - 2
  // CRLF is one CSS newline and may be the single whitespace consumed after
  // an escape, even though it occupies two JavaScript code units.
  if (value[index - 1] === '\n' && value[cursor] === '\r') cursor -= 1
  let digits = 0
  while (cursor >= 0 && digits < 6 && /[0-9a-f]/i.test(value[cursor]!)) {
    digits += 1
    cursor -= 1
  }
  return digits > 0 && value[cursor] === '\\'
}

/** Original-source ranges of escaped functions whose contents stay opaque. */
function escapedProtectedRanges(
  value: string,
  accessibleText: boolean,
  staticText: boolean,
): Array<readonly [number, number]> {
  if (!value.includes('\\')) return []
  const canonical = canonicalizeCssIdentifierEscapes(value)
  const parsed = valueParser(canonical.text)
  const ranges: Array<readonly [number, number]> = []
  parsed.walk((node) => {
    if (!shouldSkipFunction(node) && !isAlreadyFluid(node, accessibleText, staticText)) {
      return undefined
    }
    ranges.push([
      canonical.positions[node.sourceIndex] ?? node.sourceIndex,
      canonical.positions[node.sourceEndIndex] ?? value.length,
    ])
    return false
  })
  return ranges
}

function convertResolvedValue(
  value: string,
  designWidth: number,
  anchorWidth: number,
  accessibleText: boolean,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  rootValue: number,
): { value: string; generatedBounds: boolean } {
  const pattern = unitPattern(options.unitToConvert)
  const parsed = valueParser(value)
  const outputUnit = (profile.unit ?? options.unit).toLowerCase()
  const staticText = accessibleText && (profile.fontFluidity ?? options.fontFluidity) === 0
  const protectedRanges = escapedProtectedRanges(value, accessibleText, staticText)
  let generatedBounds = false
  const replaceDimension = (
    match: string,
    prefix: string,
    number: string,
    unit: string,
    authoredMatch: string = match,
    authoredPrefix: string = prefix,
  ): string => {
    // The unit this profile emits is already in its target coordinate
    // system. Reading it back as an authored design measurement breaks a
    // second pass in bare viewport mode (`10vw` becomes `1.333vw`) and is
    // conceptually wrong on the first pass too. A different configured
    // output unit still permits an intentional `vw` -> `cqi` conversion.
    if (unit.toLowerCase() === outputUnit) return authoredMatch
    // Guarded in pixels, not in authored numbers: `minPixelValue` and
    // `hairline` describe how small a thing is on screen, and `0.0625rem`
    // is the same hairline as `1px` however it was written.
    const pixels = Number.parseFloat(number) * unitScale(unit, rootValue)
    // The CSS token is still a number even when its magnitude overflows a
    // JavaScript double. Keeping the authored token is safer than replacing
    // it with `Infinitypx`, which is not CSS syntax and drops the declaration.
    if (!Number.isFinite(pixels)) return authoredMatch
    if (
      pixels === 0 ||
      Math.abs(pixels) < options.minPixelValue ||
      (options.hairline > 0 && Math.abs(pixels) <= options.hairline)
    ) {
      return authoredMatch
    }
    const converted = convertResolvedLength(
      pixels,
      designWidth,
      anchorWidth,
      accessibleText,
      profile,
      options,
      rootValue,
      unit,
    )
    // A finite authored dimension can overflow intermediate multiplication or
    // rounding. Keep that token instead of emitting an invalid CSS number.
    if (converted.includes('Infinity') || converted.includes('NaN')) return authoredMatch
    if (
      converted.startsWith('clamp(') ||
      converted.startsWith('min(') ||
      converted.startsWith('max(')
    ) {
      generatedBounds = true
    }
    return `${authoredPrefix}${converted}`
  }
  parsed.walk((node) => {
    if (shouldSkipFunction(node) || isAlreadyFluid(node, accessibleText, staticText)) return false
    if (node.type !== 'word') return undefined
    if (
      protectedRanges.some(
        ([start, end]) => node.sourceIndex >= start && node.sourceEndIndex <= end,
      )
    ) {
      return undefined
    }
    if (continuesHexEscape(value, node.sourceIndex)) return undefined
    if (!node.value.includes('\\')) {
      node.value = node.value.replace(
        pattern,
        (match, prefix: string, number: string, unit: string) =>
          replaceDimension(match, prefix, number, unit),
      )
      return undefined
    }

    // A unit is an identifier and may legally be escaped (`16p\78`). Match
    // against a canonical view, but rebuild from the authored word so an
    // unrelated escape and a guarded hairline retain their exact spelling.
    const authored = node.value
    const canonical = canonicalizeCssIdentifierEscapes(authored)
    let rebuilt = ''
    let cursor = 0
    pattern.lastIndex = 0
    for (const match of canonical.text.matchAll(pattern)) {
      const offset = match.index
      const prefix = match[1]!
      const number = match[2]!
      const unit = match[3]!
      const canonicalNumberStart = offset + prefix.length
      const canonicalUnitStart = canonicalNumberStart + number.length
      const start = canonical.positions[offset] ?? offset
      const numberStart = canonical.positions[canonicalNumberStart] ?? canonicalNumberStart
      const unitStart = canonical.positions[canonicalUnitStart] ?? canonicalUnitStart
      const end = canonical.positions[offset + match[0].length] ?? authored.length
      const authoredMatch = authored.slice(start, end)

      rebuilt += authored.slice(cursor, start)
      // CSS escapes cannot form a number token. This equality prevents an
      // identifier such as `1\36 px` from being manufactured into `16px` by
      // the canonical view and then treated as a dimension.
      rebuilt +=
        authored.slice(numberStart, unitStart) === number
          ? replaceDimension(
              match[0],
              prefix,
              number,
              unit,
              authoredMatch,
              authored.slice(start, numberStart),
            )
          : authoredMatch
      cursor = end
    }
    node.value = rebuilt + authored.slice(cursor)
    return undefined
  })
  return { value: valueParser.stringify(parsed.nodes), generatedBounds }
}

export function convertValue(
  value: string,
  property: string,
  profileName: string,
  profile: AdaptiveProfile,
  options: ResolvedAdaptiveMatrixOptions,
  file: string,
): string {
  const [designWidth, anchorWidth] = resolveProfileWidths(profileName, profile, file)
  return convertResolvedValue(
    value,
    designWidth,
    anchorWidth,
    isAccessibleTextProperty(property, options),
    profile,
    options,
    resolveRootValue(options, file),
  ).value
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
  const widths = new Map<
    string,
    Map<
      string,
      {
        designWidth: number
        anchorWidth: number
        rootValue: number
        cachePrefix: string
      }
    >
  >()
  const rootValues = new Map<string, number>()
  const textProperties = new Map<string, boolean>()
  const values = new Map<string, { value: string; generatedBounds: boolean }>()

  const convertWithMetadata = (
    value: string,
    property: string,
    profileName: string,
    profile: AdaptiveProfile,
    file: string,
  ): { value: string; generatedBounds: boolean } => {
    let fileWidths = widths.get(file)
    if (!fileWidths) {
      fileWidths = new Map()
      widths.set(file, fileWidths)
    }
    let resolved = fileWidths.get(profileName)
    if (!resolved) {
      const [designWidth, anchorWidth] = resolveProfileWidths(profileName, profile, file)
      let rootValue = rootValues.get(file)
      if (rootValue === undefined) {
        rootValue = resolveRootValue(options, file)
        rootValues.set(file, rootValue)
      }
      resolved = {
        designWidth,
        anchorWidth,
        rootValue,
        cachePrefix: JSON.stringify([profileName, designWidth, anchorWidth, rootValue]),
      }
      fileWidths.set(profileName, resolved)
    }
    const { designWidth, anchorWidth, rootValue, cachePrefix } = resolved

    let accessibleText = textProperties.get(property)
    if (accessibleText === undefined) {
      accessibleText = isAccessibleTextProperty(property, options)
      // Generated custom-property names are unbounded across rebuilds, just
      // like values. Eviction only costs a classification on the next use.
      if (textProperties.size >= MAX_CACHE_ENTRIES) textProperties.clear()
      textProperties.set(property, accessibleText)
    }

    // The anchor and resolved root ruler belong in the key alongside the design
    // width: two canvases or files can agree on one and still write differently.
    // The JSON array is an unambiguous prefix; the one-character text flag
    // separates the raw value. Serialize the resolved scalars once per canvas
    // and file, rather than re-escaping every declaration on cache hits.
    const key = cachePrefix + (accessibleText ? '1' : '0') + value
    const cached = values.get(key)
    if (cached !== undefined) return cached

    const converted = convertResolvedValue(
      value,
      designWidth,
      anchorWidth,
      accessibleText,
      profile,
      options,
      rootValue,
    )
    if (values.size >= MAX_CACHE_ENTRIES) values.clear()
    values.set(key, converted)
    return converted
  }

  return {
    /**
     * Drops per-file memoisation before a stylesheet is processed.
     *
     * Functional widths and `rootValue` may legitimately return something new
     * for the same path on a rebuild, so their results must not outlive one
     * pass. The value cache is keyed on every resolved scalar and stays correct.
     */
    beginFile(): void {
      widths.clear()
      rootValues.clear()
    },

    /** Cheap rejection for declarations that cannot contain a convertible length. */
    mightContainUnit(value: string): boolean {
      // Loop rather than `some`, to keep the single-unit case — which is nearly
      // every project, and runs on every declaration — free of a closure.
      for (const unit of unitsLower) {
        if (containsIgnoreCase(value, unit)) return true
      }
      if (value.includes('\\')) {
        const canonical = canonicalizeCssIdentifierEscapes(value).text
        for (const unit of unitsLower) {
          if (containsIgnoreCase(canonical, unit)) return true
        }
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
      return convertWithMetadata(value, property, profileName, profile, file).value
    },

    /** Internal diagnostic evidence collected during the conversion's existing parse. */
    convertWithMetadata,
  }
}

export type Converter = ReturnType<typeof createConverter>
