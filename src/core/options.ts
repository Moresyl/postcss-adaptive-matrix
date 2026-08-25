import { LIBRARY_PROFILE_PREFIX, expandLibraries, resolveLibraries } from './libraries.js'
import { appPcPreset } from './presets.js'
import { isCssCustomIdentifier, isCssIdentifier, isCssLayerName } from './syntax.js'
import { isObject, rejectUnknownKeys, requireFileMatchers, valueKind } from './validation.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  MediaMatcher,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

// `libraries` is absent because its default is computed, not a constant: see
// `resolveLibraries`, which expands an omitted option into every built-in.
const DEFAULTS: Omit<ResolvedAdaptiveMatrixOptions, 'profiles' | 'root' | 'libraries'> & {
  root: false
} = {
  defaultProfile: 'app',
  routes: [],
  atRuleName: 'adaptive',
  strategy: 'clamp',
  unit: 'vw',
  precision: 5,
  unitToConvert: ['px'],
  rootValue: 16,
  minPixelValue: 0,
  hairline: 1,
  fontFluidity: 0.35,
  textProperties: [
    'font',
    'font-size',
    'line-height',
    'letter-spacing',
    'word-spacing',
    // Type scales published as theme tokens rather than as declarations. Atomic
    // CSS frameworks emit `.text-lg { font-size: var(--text-lg) }`, which puts
    // the only length behind a name no property list would otherwise recognise
    // as text — and a font size that misses this list loses browser zoom.
    //
    // Inert until something routes those tokens: custom properties are not
    // converted unless claimed, and this list only decides *how* a claimed
    // length is written, never whether it is.
    '--text-*',
    '--leading-*',
  ],
  propList: ['*'],
  selectorExclude: [],
  valueExclude: [],
  transformCustomProperties: false,
  preserveOriginal: false,
  root: false,
  unknownProfile: 'warn',
}

const SCALE_UNITS = new Set(['vw', 'vi', 'cqw', 'cqi'])
const OUTPUT_STRATEGIES = new Set(['clamp', 'viewport'])

/**
 * At-keywords CSS already defines.
 *
 * Taking one of these over would make the compiler consume every `@media` in
 * the stylesheet as though it named a canvas — every block warned about and
 * rewritten. The type system cannot help here: `atRuleName` is a plain string,
 * and the configuration is usually a `.mjs` file that nothing type-checks.
 */
// prettier-ignore
const RESERVED_AT_RULES = new Set([
  'charset', 'import', 'namespace', 'media', 'supports', 'document', 'page',
  'font-face', 'font-feature-values', 'font-palette-values', 'keyframes',
  'counter-style', 'property', 'layer', 'container', 'scope', 'starting-style',
  'position-try', 'view-transition',
])

const UNKNOWN_PROFILE_POLICIES = new Set(['warn', 'error', 'ignore'])

const OPTION_KEYS = [
  'profiles',
  'defaultProfile',
  'routes',
  'libraries',
  'atRuleName',
  'strategy',
  'unit',
  'precision',
  'unitToConvert',
  'rootValue',
  'minPixelValue',
  'hairline',
  'fontFluidity',
  'textProperties',
  'propList',
  'selectorExclude',
  'valueExclude',
  'include',
  'exclude',
  'transformCustomProperties',
  'preserveOriginal',
  'root',
  'unknownProfile',
] as const satisfies readonly (keyof AdaptiveMatrixOptions)[]

const ROUTE_KEYS = ['profile', 'file', 'selector', 'property', 'media'] as const
const MEDIA_KEYS = ['minWidth', 'maxWidth'] as const
const ROOT_KEYS = [
  'selector',
  'center',
  'container',
  'containerName',
  'safeAreaVariables',
  'layer',
  'fixedContainingBlock',
  'logical',
  'injectTo',
] as const
const PROFILE_KEYS = [
  'designWidth',
  'fluid',
  'query',
  'unit',
  'strategy',
  'fontFluidity',
  'textAnchorWidth',
  'rootMaxWidth',
] as const
const FLUID_KEYS = ['minWidth', 'maxWidth'] as const
const QUERY_KEYS = ['type', 'condition', 'name'] as const

function requireArray(name: string, value: unknown): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${name} must be an array, not ${valueKind(value)}.`,
    )
  }
}

function requireStringArray(name: string, value: unknown): void {
  requireArray(name, value)
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') {
      throw new TypeError(
        `[postcss-adaptive-matrix] ${name}[${index}] must be a string, not ${valueKind(entry)}.`,
      )
    }
    if (!entry.trim()) {
      throw new TypeError(`[postcss-adaptive-matrix] ${name}[${index}] cannot be empty.`)
    }
  }
}

function requirePatterns(name: string, value: unknown): void {
  requireArray(name, value)
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' && !(entry instanceof RegExp)) {
      throw new TypeError(
        `[postcss-adaptive-matrix] ${name}[${index}] must be a string or regular expression, not ${valueKind(entry)}.`,
      )
    }
    if (typeof entry === 'string' && !entry.trim()) {
      throw new TypeError(`[postcss-adaptive-matrix] ${name}[${index}] cannot be empty.`)
    }
  }
}

function requireBoolean(name: string, value: unknown): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${name} must be a boolean, not ${valueKind(value)}.`,
    )
  }
}

function validateRouteShape(route: unknown, index: number): void {
  const path = `routes[${index}]`
  if (!isObject(route)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${path} must be an object, not ${valueKind(route)}.`,
    )
  }
  rejectUnknownKeys(path, route, ROUTE_KEYS)
  if (route.profile !== false && typeof route.profile !== 'string') {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${path}.profile must be a profile name or false, not ${valueKind(route.profile)}.`,
    )
  }
  if (typeof route.profile === 'string' && !route.profile.trim()) {
    throw new TypeError(`[postcss-adaptive-matrix] ${path}.profile cannot be empty.`)
  }
  if (route.file !== undefined) requireFileMatchers(`${path}.file`, route.file)
  if (route.selector !== undefined) {
    const selectors = Array.isArray(route.selector) ? route.selector : [route.selector]
    requirePatterns(`${path}.selector`, selectors)
    if (!selectors.length) {
      throw new TypeError(`[postcss-adaptive-matrix] ${path}.selector cannot be an empty array.`)
    }
  }
  if (route.property !== undefined) {
    const properties = Array.isArray(route.property) ? route.property : [route.property]
    if (!properties.length) {
      throw new TypeError(`[postcss-adaptive-matrix] ${path}.property cannot be an empty array.`)
    }
    for (const [propertyIndex, prefix] of properties.entries()) {
      if (typeof prefix !== 'string') {
        throw new TypeError(
          `[postcss-adaptive-matrix] Route property takes custom-property prefixes as strings, ` +
            `such as '--van-'. ${path}.property[${propertyIndex}] received ${prefix instanceof RegExp ? `the regular expression ${String(prefix)}` : valueKind(prefix)}. ` +
            `Matching is by prefix and case-sensitive, like custom-property names in CSS; list several prefixes to cover several token families.`,
        )
      }
      if (!prefix.trim()) {
        throw new TypeError(
          `[postcss-adaptive-matrix] ${path}.property[${propertyIndex}] cannot be empty.`,
        )
      }
    }
  }
  if (route.media !== undefined) {
    const matchers = Array.isArray(route.media) ? route.media : [route.media]
    if (!matchers.length) {
      throw new TypeError(`[postcss-adaptive-matrix] ${path}.media cannot be an empty array.`)
    }
    for (const [matcherIndex, matcher] of matchers.entries()) {
      if (!isObject(matcher)) {
        throw new TypeError(
          `[postcss-adaptive-matrix] ${path}.media[${matcherIndex}] must be an object, not ${valueKind(matcher)}.`,
        )
      }
      rejectUnknownKeys(`${path}.media[${matcherIndex}]`, matcher, MEDIA_KEYS)
    }
  }
  if (
    route.file === undefined &&
    route.selector === undefined &&
    route.property === undefined &&
    route.media === undefined
  ) {
    throw new Error(
      `[postcss-adaptive-matrix] ${path} matches nothing. Give it a file, selector, property or media condition.`,
    )
  }
}

function validateRootShape(root: unknown): void {
  if (root === undefined || root === false) return
  if (!isObject(root)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] root must be false or an options object, not ${valueKind(root)}.`,
    )
  }
  rejectUnknownKeys('root', root, ROOT_KEYS)
  if (typeof root.selector !== 'string') {
    throw new TypeError('[postcss-adaptive-matrix] root.selector must be a string.')
  }
  for (const field of [
    'center',
    'container',
    'safeAreaVariables',
    'fixedContainingBlock',
    'logical',
  ] as const) {
    requireBoolean(`root.${field}`, root[field])
  }
  if (root.containerName !== undefined && typeof root.containerName !== 'string') {
    throw new TypeError(
      `[postcss-adaptive-matrix] root.containerName must be a string, not ${valueKind(root.containerName)}.`,
    )
  }
  if (typeof root.containerName === 'string' && !root.containerName.trim()) {
    throw new Error('[postcss-adaptive-matrix] root.containerName cannot be empty.')
  }
  if (typeof root.containerName === 'string' && !isCssCustomIdentifier(root.containerName)) {
    throw new Error(
      `[postcss-adaptive-matrix] root.containerName "${root.containerName}" is not a valid non-reserved unescaped CSS custom identifier.`,
    )
  }
  if (root.layer !== undefined && root.layer !== false && typeof root.layer !== 'string') {
    throw new TypeError(
      `[postcss-adaptive-matrix] root.layer must be a string or false, not ${valueKind(root.layer)}.`,
    )
  }
  if (typeof root.layer === 'string' && !root.layer.trim()) {
    throw new Error('[postcss-adaptive-matrix] root.layer cannot be empty.')
  }
  if (typeof root.layer === 'string' && !isCssLayerName(root.layer)) {
    throw new Error(
      `[postcss-adaptive-matrix] root.layer "${root.layer}" must be one dot-separated CSS layer name, such as "adaptive-matrix" or "framework.layout".`,
    )
  }
  if (root.injectTo !== undefined) requireFileMatchers('root.injectTo', root.injectTo)
}

function validateInputShape(input: unknown): void {
  if (!isObject(input)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] Options must be an object, not ${valueKind(input)}.`,
    )
  }
  rejectUnknownKeys('options', input, OPTION_KEYS)
  if (input.profiles !== undefined && !isObject(input.profiles)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] profiles must be an object keyed by profile name, not ${valueKind(input.profiles)}.`,
    )
  }
  if (input.routes !== undefined) {
    requireArray('routes', input.routes)
    input.routes.forEach(validateRouteShape)
  }
  for (const field of ['textProperties', 'propList'] as const) {
    if (input[field] !== undefined) requireStringArray(field, input[field])
  }
  for (const field of ['selectorExclude', 'valueExclude'] as const) {
    if (input[field] !== undefined) requirePatterns(field, input[field])
  }
  for (const field of ['include', 'exclude'] as const) {
    if (input[field] !== undefined) requireFileMatchers(field, input[field])
  }
  for (const field of ['transformCustomProperties', 'preserveOriginal'] as const) {
    requireBoolean(field, input[field])
  }
  validateRootShape(input.root)
}

/**
 * Rejects a unit or strategy the compiler cannot emit.
 *
 * `unit` is the one option where a typo produces *invalid* CSS rather than
 * wrong CSS: `4.267vm` is not a length, so the browser drops the declaration
 * and the element keeps whatever it inherited. Nothing reports that — not the
 * build, not the console, not the page.
 */
function validateUnitAndStrategy(
  where: string,
  unit: string | undefined,
  strategy: string | undefined,
): void {
  if (unit !== undefined && !SCALE_UNITS.has(unit)) {
    throw new Error(
      `[postcss-adaptive-matrix] ${where} unit "${unit}" is not a scaling unit. ` +
        `Use one of: ${[...SCALE_UNITS].join(', ')}.`,
    )
  }
  if (strategy !== undefined && !OUTPUT_STRATEGIES.has(strategy)) {
    // Silently falling back to `clamp` would look like the setting worked.
    throw new Error(
      `[postcss-adaptive-matrix] ${where} strategy "${strategy}" is unknown. ` +
        `Use one of: ${[...OUTPUT_STRATEGIES].join(', ')}.`,
    )
  }
}

function validateProfile(name: string, profile: AdaptiveProfile): void {
  if (!isObject(profile)) {
    throw new TypeError(`[postcss-adaptive-matrix] Profile "${name}" must be an object.`)
  }
  const path = `profiles[${JSON.stringify(name)}]`
  rejectUnknownKeys(path, profile, PROFILE_KEYS)
  if (!isObject(profile.fluid)) {
    throw new TypeError(`[postcss-adaptive-matrix] Profile "${name}" fluid must be an object.`)
  }
  rejectUnknownKeys(`${path}.fluid`, profile.fluid, FLUID_KEYS)
  const { minWidth, maxWidth } = profile.fluid
  if (
    !Number.isFinite(minWidth) ||
    !Number.isFinite(maxWidth) ||
    minWidth <= 0 ||
    maxWidth <= minWidth
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires fluid.minWidth > 0 and fluid.maxWidth > fluid.minWidth.`,
    )
  }
  if (
    typeof profile.designWidth !== 'function' &&
    (!Number.isFinite(profile.designWidth) || profile.designWidth <= 0)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires a positive designWidth.`,
    )
  }
  if (
    profile.textAnchorWidth != null &&
    typeof profile.textAnchorWidth !== 'function' &&
    (!Number.isFinite(profile.textAnchorWidth) || profile.textAnchorWidth <= 0)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires a positive textAnchorWidth.`,
    )
  }
  if (
    profile.fontFluidity != null &&
    (!Number.isFinite(profile.fontFluidity) || profile.fontFluidity < 0 || profile.fontFluidity > 1)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" fontFluidity must be between 0 and 1.`,
    )
  }
  if (
    profile.rootMaxWidth != null &&
    (!Number.isFinite(profile.rootMaxWidth) || profile.rootMaxWidth <= 0)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" requires a positive rootMaxWidth.`,
    )
  }
  if (profile.query !== undefined && profile.query !== false) {
    if (typeof profile.query === 'string') {
      if (!profile.query.trim()) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query cannot be an empty string.`,
        )
      }
    } else {
      if (!isObject(profile.query)) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query must be a string, query object or false.`,
        )
      }
      rejectUnknownKeys(`${path}.query`, profile.query, QUERY_KEYS)
      if (typeof profile.query.condition !== 'string' || !profile.query.condition.trim()) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query.condition must be a non-empty string.`,
        )
      }
      if (
        profile.query.type !== undefined &&
        profile.query.type !== 'media' &&
        profile.query.type !== 'container'
      ) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query.type must be "media" or "container".`,
        )
      }
      if (
        profile.query.name !== undefined &&
        (typeof profile.query.name !== 'string' || !profile.query.name.trim())
      ) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query.name must be a non-empty string.`,
        )
      }
      if (typeof profile.query.name === 'string' && !isCssCustomIdentifier(profile.query.name)) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query.name "${profile.query.name}" is not a valid non-reserved unescaped CSS custom identifier.`,
        )
      }
      if (profile.query.name !== undefined && (profile.query.type ?? 'media') !== 'container') {
        throw new TypeError(
          `[postcss-adaptive-matrix] Profile "${name}" query.name only applies to container queries.`,
        )
      }
    }
  }
  validateUnitAndStrategy(`Profile "${name}"`, profile.unit, profile.strategy)
}

/**
 * One unit or several, reduced to a clean list.
 *
 * Blanks are dropped rather than rejected so that a list assembled from
 * configuration — `[base, extra && 'rem']` — does not have to be pruned by the
 * caller; a list that ends up empty is still an error, checked below.
 * Duplicates are dropped case-insensitively because the match is, and a unit
 * repeated in the alternation would only make the pattern slower.
 * Longest first, so no unit can be shadowed by one that is its own suffix.
 */
function normaliseUnits(input: string | readonly string[]): string[] {
  if (typeof input !== 'string' && !Array.isArray(input)) {
    throw new TypeError(
      '[postcss-adaptive-matrix] unitToConvert must be a unit string or an array of unit strings.',
    )
  }
  const listed = typeof input === 'string' ? [input] : (input as readonly unknown[])
  const seen = new Set<string>()
  const units: string[] = []
  for (const [index, entry] of listed.entries()) {
    if (typeof entry !== 'string') {
      throw new TypeError(
        `[postcss-adaptive-matrix] unitToConvert[${index}] must be a unit string, not ${typeof entry}.`,
      )
    }
    const unit = entry.trim()
    const key = unit.toLowerCase()
    if (!unit || seen.has(key)) continue
    if (!isCssIdentifier(unit)) {
      throw new TypeError(
        `[postcss-adaptive-matrix] unitToConvert[${index}] "${unit}" is not a valid unescaped CSS unit identifier.`,
      )
    }
    seen.add(key)
    units.push(unit)
  }
  return units.sort((a, b) => b.length - a.length)
}

export function resolveOptions(input: AdaptiveMatrixOptions = {}): ResolvedAdaptiveMatrixOptions {
  validateInputShape(input)
  const preset = appPcPreset()
  const authored = input.profiles ?? preset.profiles!
  const libraries = resolveLibraries(input.libraries)
  const options: ResolvedAdaptiveMatrixOptions = {
    ...DEFAULTS,
    ...input,
    unitToConvert: normaliseUnits(input.unitToConvert ?? DEFAULTS.unitToConvert),
    libraries,
    profiles: authored,
    root: input.root ?? false,
  }

  if (typeof options.defaultProfile !== 'string' || !options.defaultProfile.trim()) {
    throw new TypeError('[postcss-adaptive-matrix] defaultProfile must be a non-empty string.')
  }
  if (!authored[options.defaultProfile]) {
    throw new Error(
      `[postcss-adaptive-matrix] defaultProfile "${options.defaultProfile}" does not exist.`,
    )
  }
  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 12) {
    throw new RangeError('[postcss-adaptive-matrix] precision must be an integer from 0 to 12.')
  }
  if (
    !Number.isFinite(options.fontFluidity) ||
    options.fontFluidity < 0 ||
    options.fontFluidity > 1
  ) {
    throw new RangeError('[postcss-adaptive-matrix] fontFluidity must be between 0 and 1.')
  }
  for (const [name, value] of [
    ['minPixelValue', options.minPixelValue],
    ['hairline', options.hairline],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`[postcss-adaptive-matrix] ${name} must be a non-negative number.`)
    }
  }
  if (!UNKNOWN_PROFILE_POLICIES.has(options.unknownProfile)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] unknownProfile must be "warn", "error" or "ignore", not ${JSON.stringify(options.unknownProfile)}.`,
    )
  }
  if (!options.propList.length) {
    throw new Error('[postcss-adaptive-matrix] propList cannot be empty.')
  }
  validateUnitAndStrategy('Option', options.unit, options.strategy)
  // An empty `unitToConvert` matches no length at all, so the plugin would walk
  // the whole stylesheet and change nothing — indistinguishable from not having
  // been registered.
  if (!options.unitToConvert.length) {
    throw new Error(
      '[postcss-adaptive-matrix] unitToConvert cannot be empty; it names the unit to read, such as "px".',
    )
  }
  // Zero would read every `rem` as zero and divide by zero on the way out;
  // a negative root font size would flip the sign of every text length.
  if (!Number.isFinite(options.rootValue) || options.rootValue <= 0) {
    throw new RangeError(
      '[postcss-adaptive-matrix] rootValue must be a positive number of pixels, such as 16.',
    )
  }
  if (typeof options.atRuleName !== 'string') {
    throw new TypeError('[postcss-adaptive-matrix] atRuleName must be a string.')
  }
  const atRuleName = options.atRuleName.trim().toLowerCase()
  if (!atRuleName) {
    throw new Error(
      '[postcss-adaptive-matrix] atRuleName cannot be empty; it names the directive that selects a canvas, such as "adaptive".',
    )
  }
  if (!isCssIdentifier(atRuleName)) {
    throw new Error(
      `[postcss-adaptive-matrix] atRuleName "${options.atRuleName}" is not a valid unescaped CSS identifier.`,
    )
  }
  if (RESERVED_AT_RULES.has(atRuleName)) {
    throw new Error(
      `[postcss-adaptive-matrix] atRuleName "${options.atRuleName}" is a CSS at-rule. ` +
        `Every @${atRuleName} in the stylesheet would be read as naming a canvas and rewritten.`,
    )
  }
  // Validation and matching must use the same spelling. Keeping the authored
  // whitespace here lets `atRuleName: ' canvas '` pass validation but never
  // match `@canvas`, after which the browser discards the unknown block.
  options.atRuleName = atRuleName
  // `:where()` with nothing inside it is a parse error, so an empty selector
  // does not produce a weak foundation — it produces one the browser discards
  // whole, taking the safe-area variables and the root cap with it.
  if (options.root && !options.root.selector.trim()) {
    throw new Error(
      '[postcss-adaptive-matrix] root.selector cannot be empty; it names the element that carries the layout, such as "#app".',
    )
  }
  // A list of nothing but exclusions can never match, so the plugin would run
  // over every stylesheet and convert none of it — the same outcome as an empty
  // list, reached by a much likelier route. `['!border*']` reads like "convert
  // everything except borders" and has to be written `['*', '!border*']`.
  if (options.propList.every((entry) => entry.startsWith('!'))) {
    throw new Error(
      '[postcss-adaptive-matrix] propList contains only exclusions, so it matches nothing. ' +
        `Add '*' to convert the rest: ['*', ${options.propList.map((entry) => `'${entry}'`).join(', ')}].`,
    )
  }
  for (const [name, profile] of Object.entries(authored)) {
    if (!name.trim()) {
      throw new TypeError('[postcss-adaptive-matrix] Profile names cannot be empty.')
    }
    // `library:` belongs to the registry, and the expansion below overwrites
    // whatever shares a name with it. Someone writing `'library:vant'` is
    // trying to retune that canvas, and would get a profile that silently does
    // nothing — so name the option that actually does it.
    if (name.startsWith(LIBRARY_PROFILE_PREFIX)) {
      throw new Error(
        `[postcss-adaptive-matrix] Profile "${name}" uses the reserved "${LIBRARY_PROFILE_PREFIX}" prefix. ` +
          `To retune an adapted library, use libraries: [{ extends: '${name.slice(LIBRARY_PROFILE_PREFIX.length)}', ... }].`,
      )
    }
    validateProfile(name, profile)
  }

  // A band with no bounds matches every rule in the stylesheet, which is a
  // route that silently replaces `defaultProfile` — and reversed bounds match
  // nothing at all. Both read as working configuration, so neither may be
  // discovered from the output.
  for (const route of options.routes) {
    if (route.media === undefined) continue
    const matchers = Array.isArray(route.media) ? route.media : [route.media]
    for (const matcher of matchers as MediaMatcher[]) {
      const { minWidth, maxWidth } = matcher ?? {}
      if (minWidth === undefined && maxWidth === undefined) {
        throw new TypeError(
          `[postcss-adaptive-matrix] Route media needs minWidth, maxWidth or both. ` +
            `An empty band matches every rule, which is a slower way of changing defaultProfile.`,
        )
      }
      for (const [field, bound] of [
        ['minWidth', minWidth],
        ['maxWidth', maxWidth],
      ] as const) {
        if (bound !== undefined && (!Number.isFinite(bound) || bound < 0)) {
          throw new RangeError(
            `[postcss-adaptive-matrix] Route media.${field} must be a width in pixels, not ${String(bound)}.`,
          )
        }
      }
      if (minWidth !== undefined && maxWidth !== undefined && maxWidth < minWidth) {
        throw new RangeError(
          `[postcss-adaptive-matrix] Route media band ${minWidth}px–${maxWidth}px is empty, so it can never match.`,
        )
      }
    }
  }

  // Expanded last, so library canvases can be cloned from profiles already
  // known to be valid. Library routes go after the authored ones because an
  // explicit route is a decision, while a library entry is a default.
  if (libraries.length) {
    const expansion = expandLibraries(libraries, authored, options.defaultProfile)
    options.profiles = { ...authored, ...expansion.profiles }
    options.routes = [...options.routes, ...expansion.routes]
  }
  for (const [index, route] of options.routes.entries()) {
    if (route.profile !== false && !options.profiles[route.profile]) {
      throw new Error(
        `[postcss-adaptive-matrix] routes[${index}].profile targets unknown profile "${route.profile}".`,
      )
    }
  }
  return options
}
