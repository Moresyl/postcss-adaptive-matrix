import {
  LIBRARY_PROFILE_PREFIX,
  expandLibraries,
  resolveLibraries,
} from './libraries.js'
import { appPcPreset } from './presets.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  MediaMatcher,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

// `libraries` is absent because its default is computed, not a constant: see
// `resolveLibraries`, which expands an omitted option into every built-in.
const DEFAULTS: Omit<
  ResolvedAdaptiveMatrixOptions,
  'profiles' | 'root' | 'libraries'
> & { root: false } = {
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
const RESERVED_AT_RULES = new Set([
  'charset', 'import', 'namespace', 'media', 'supports', 'document', 'page',
  'font-face', 'font-feature-values', 'font-palette-values', 'keyframes',
  'counter-style', 'property', 'layer', 'container', 'scope', 'starting-style',
  'position-try', 'view-transition',
])

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
  if (!profile || typeof profile !== 'object') {
    throw new TypeError(
      `[postcss-adaptive-matrix] Profile "${name}" must be an object.`,
    )
  }
  const { minWidth, maxWidth } = profile.fluid ?? {}
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
    (profile.fontFluidity < 0 || profile.fontFluidity > 1)
  ) {
    throw new RangeError(
      `[postcss-adaptive-matrix] Profile "${name}" fontFluidity must be between 0 and 1.`,
    )
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
  const listed = typeof input === 'string' ? [input] : input
  const seen = new Set<string>()
  const units: string[] = []
  for (const entry of listed) {
    const unit = entry.trim()
    const key = unit.toLowerCase()
    if (!unit || seen.has(key)) continue
    seen.add(key)
    units.push(unit)
  }
  return units.sort((a, b) => b.length - a.length)
}

export function resolveOptions(
  input: AdaptiveMatrixOptions = {},
): ResolvedAdaptiveMatrixOptions {
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

  if (!authored[options.defaultProfile]) {
    throw new Error(
      `[postcss-adaptive-matrix] defaultProfile "${options.defaultProfile}" does not exist.`,
    )
  }
  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 12) {
    throw new RangeError(
      '[postcss-adaptive-matrix] precision must be an integer from 0 to 12.',
    )
  }
  if (options.fontFluidity < 0 || options.fontFluidity > 1) {
    throw new RangeError(
      '[postcss-adaptive-matrix] fontFluidity must be between 0 and 1.',
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
  const atRuleName = options.atRuleName.trim().toLowerCase()
  if (!atRuleName) {
    throw new Error(
      '[postcss-adaptive-matrix] atRuleName cannot be empty; it names the directive that selects a canvas, such as "adaptive".',
    )
  }
  if (RESERVED_AT_RULES.has(atRuleName)) {
    throw new Error(
      `[postcss-adaptive-matrix] atRuleName "${options.atRuleName}" is a CSS at-rule. ` +
        `Every @${atRuleName} in the stylesheet would be read as naming a canvas and rewritten.`,
    )
  }
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

  // The other two route channels take patterns, so reaching for a regex here is
  // the natural mistake. Left alone it surfaces as `prefix.toLowerCase is not a
  // function` from inside the resolver, with nothing pointing at the route that
  // caused it — and a regex is exactly what someone writes when a plain prefix
  // is not selective enough, so the message has to say what to write instead.
  for (const route of options.routes) {
    if (route.property === undefined) continue
    const prefixes = Array.isArray(route.property) ? route.property : [route.property]
    for (const prefix of prefixes as unknown[]) {
      if (typeof prefix !== 'string') {
        throw new TypeError(
          `[postcss-adaptive-matrix] Route property takes custom-property prefixes as strings, ` +
            `such as '--van-'. Received ${prefix instanceof RegExp ? `the regular expression ${String(prefix)}` : typeof prefix}. ` +
            `Matching is by prefix and case-insensitive; list several prefixes to cover several token families.`,
        )
      }
    }
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
      for (const [field, bound] of [['minWidth', minWidth], ['maxWidth', maxWidth]] as const) {
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
  return options
}
