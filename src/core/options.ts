import {
  LIBRARY_PROFILE_PREFIX,
  expandLibraries,
  resolveLibraries,
} from './libraries.js'
import { appPcPreset } from './presets.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
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
  unitToConvert: 'px',
  minPixelValue: 0,
  hairline: 1,
  fontFluidity: 0.35,
  textProperties: [
    'font',
    'font-size',
    'line-height',
    'letter-spacing',
    'word-spacing',
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

export function resolveOptions(
  input: AdaptiveMatrixOptions = {},
): ResolvedAdaptiveMatrixOptions {
  const preset = appPcPreset()
  const authored = input.profiles ?? preset.profiles!
  const libraries = resolveLibraries(input.libraries)
  const options: ResolvedAdaptiveMatrixOptions = {
    ...DEFAULTS,
    ...input,
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
  if (!options.unitToConvert.trim()) {
    throw new Error(
      '[postcss-adaptive-matrix] unitToConvert cannot be empty; it names the unit to read, such as "px".',
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
