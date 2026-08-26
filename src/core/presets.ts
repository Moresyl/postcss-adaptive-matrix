import type {
  AdaptiveMatrixOptions,
  AdaptiveRoute,
  AppPcPresetOptions,
  AtomicCssOptions,
} from './types.js'
import { isCssIdentifier, isCssLayerName } from './syntax.js'
import { isObject, rejectUnknownKeys, requireFileMatchers, valueKind } from './validation.js'

const APP_PC_PRESET_KEYS = [
  'appDesignWidth',
  'pcDesignWidth',
  'breakpoint',
  'appFluidMin',
  'appFluidMax',
  'pcFluidMin',
  'pcFluidMax',
  'root',
  'rootSelector',
  'container',
  'fixedContainingBlock',
  'rootInjectTo',
  'rootLayer',
  'rootLogical',
] as const satisfies readonly (keyof AppPcPresetOptions)[]

const ROOT_PRESET_SETTING_KEYS = [
  'rootSelector',
  'container',
  'fixedContainingBlock',
  'rootInjectTo',
  'rootLayer',
  'rootLogical',
] as const

const ATOMIC_CSS_KEYS = [
  'profile',
  'tokenPrefixes',
] as const satisfies readonly (keyof AtomicCssOptions)[]

function requireOptionsObject(
  name: string,
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${name} must be an options object, not ${valueKind(value)}.`,
    )
  }
}

function requireOptionalBoolean(name: string, value: unknown): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(
      `[postcss-adaptive-matrix] ${name} must be a boolean, not ${valueKind(value)}.`,
    )
  }
}

function validateAppPcPresetOptions(value: unknown): asserts value is AppPcPresetOptions {
  requireOptionsObject('appPcPreset options', value)
  rejectUnknownKeys('appPcPreset options', value, APP_PC_PRESET_KEYS)
  for (const field of [
    'appDesignWidth',
    'pcDesignWidth',
    'breakpoint',
    'appFluidMin',
    'appFluidMax',
    'pcFluidMin',
    'pcFluidMax',
  ] as const) {
    const current = value[field]
    if (current !== undefined && (!Number.isFinite(current) || (current as number) <= 0)) {
      throw new RangeError(
        `[postcss-adaptive-matrix] appPcPreset options.${field} must be a positive finite number.`,
      )
    }
  }
  if (typeof value.breakpoint === 'number' && value.breakpoint <= 0.02) {
    throw new RangeError(
      '[postcss-adaptive-matrix] appPcPreset options.breakpoint must be greater than 0.02px so the app media range remains non-negative.',
    )
  }
  for (const field of ['root', 'container', 'fixedContainingBlock', 'rootLogical'] as const) {
    requireOptionalBoolean(`appPcPreset options.${field}`, value[field])
  }
  if (value.rootSelector !== undefined) {
    if (typeof value.rootSelector !== 'string') {
      throw new TypeError(
        `[postcss-adaptive-matrix] appPcPreset options.rootSelector must be a string, not ${valueKind(value.rootSelector)}.`,
      )
    }
    if (!value.rootSelector.trim()) {
      throw new TypeError(
        '[postcss-adaptive-matrix] appPcPreset options.rootSelector cannot be empty.',
      )
    }
  }
  if (
    value.rootLayer !== undefined &&
    value.rootLayer !== false &&
    typeof value.rootLayer !== 'string'
  ) {
    throw new TypeError(
      `[postcss-adaptive-matrix] appPcPreset options.rootLayer must be a string or false, not ${valueKind(value.rootLayer)}.`,
    )
  }
  if (typeof value.rootLayer === 'string' && !value.rootLayer.trim()) {
    throw new TypeError('[postcss-adaptive-matrix] appPcPreset options.rootLayer cannot be empty.')
  }
  if (typeof value.rootLayer === 'string' && !isCssLayerName(value.rootLayer)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] appPcPreset options.rootLayer "${value.rootLayer}" must be one dot-separated CSS layer name.`,
    )
  }
  if (value.rootInjectTo !== undefined) {
    requireFileMatchers('appPcPreset options.rootInjectTo', value.rootInjectTo)
  }
  const conflictingRootSetting = ROOT_PRESET_SETTING_KEYS.find(
    (field) => value[field] !== undefined,
  )
  if (value.root === false && conflictingRootSetting) {
    throw new TypeError(
      `[postcss-adaptive-matrix] appPcPreset options.${conflictingRootSetting} cannot be used with root: false; that setting would be ignored.`,
    )
  }
}

function validateAtomicCssOptions(value: unknown): asserts value is AtomicCssOptions {
  requireOptionsObject('withAtomicCss options', value)
  rejectUnknownKeys('withAtomicCss options', value, ATOMIC_CSS_KEYS)
  if (value.profile !== undefined && (typeof value.profile !== 'string' || !value.profile.trim())) {
    throw new TypeError(
      '[postcss-adaptive-matrix] withAtomicCss options.profile must be a non-empty string.',
    )
  }
  if (value.tokenPrefixes !== undefined) {
    if (!Array.isArray(value.tokenPrefixes)) {
      throw new TypeError(
        `[postcss-adaptive-matrix] withAtomicCss options.tokenPrefixes must be an array, not ${valueKind(value.tokenPrefixes)}.`,
      )
    }
    for (const [index, prefix] of value.tokenPrefixes.entries()) {
      if (
        typeof prefix !== 'string' ||
        prefix.length <= 2 ||
        prefix.trim() !== prefix ||
        !prefix.startsWith('--')
      ) {
        throw new TypeError(
          `[postcss-adaptive-matrix] withAtomicCss options.tokenPrefixes[${index}] must be a non-empty custom-property prefix starting with "--".`,
        )
      }
    }
  }
}

function validateAtomicCssBase(value: unknown): asserts value is AdaptiveMatrixOptions {
  requireOptionsObject('withAtomicCss base', value)
  if (
    value.unitToConvert !== undefined &&
    typeof value.unitToConvert !== 'string' &&
    !Array.isArray(value.unitToConvert)
  ) {
    throw new TypeError(
      `[postcss-adaptive-matrix] withAtomicCss base.unitToConvert must be a string or array, not ${valueKind(value.unitToConvert)}.`,
    )
  }
  if (Array.isArray(value.unitToConvert)) {
    for (const [index, unit] of value.unitToConvert.entries()) {
      if (typeof unit !== 'string') {
        throw new TypeError(
          `[postcss-adaptive-matrix] withAtomicCss base.unitToConvert[${index}] must be a string, not ${valueKind(unit)}.`,
        )
      }
      if (unit.trim() && !isCssIdentifier(unit.trim())) {
        throw new TypeError(
          `[postcss-adaptive-matrix] withAtomicCss base.unitToConvert[${index}] "${unit.trim()}" is not a valid unescaped CSS unit identifier.`,
        )
      }
    }
  }
  if (
    typeof value.unitToConvert === 'string' &&
    value.unitToConvert.trim() &&
    !isCssIdentifier(value.unitToConvert.trim())
  ) {
    throw new TypeError(
      `[postcss-adaptive-matrix] withAtomicCss base.unitToConvert "${value.unitToConvert.trim()}" is not a valid unescaped CSS unit identifier.`,
    )
  }
  for (const field of ['routes'] as const) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      throw new TypeError(
        `[postcss-adaptive-matrix] withAtomicCss base.${field} must be an array, not ${valueKind(value[field])}.`,
      )
    }
  }
  if (
    value.textProperties !== undefined &&
    typeof value.textProperties !== 'string' &&
    !Array.isArray(value.textProperties)
  ) {
    throw new TypeError(
      `[postcss-adaptive-matrix] withAtomicCss base.textProperties must be a string or array, not ${valueKind(value.textProperties)}.`,
    )
  }
}

/**
 * A practical two-canvas preset: author the app at 375px and desktop at 1440px.
 * The breakpoint and both fluid ranges remain configurable.
 *
 * `breakpoint` is stated three times over, and the third is the one that used
 * to be missing. It sets each profile's `query`, so an `@adaptive pc` block
 * comes out wrapped in the right media query — and it now also *reads* media
 * queries, so a plain `@media (min-width: 768px)` block written by hand lands
 * on the desktop canvas too. Saying "the desktop design file takes over at
 * 768px" and then compiling everything past 768px against the phone design
 * file was the preset disagreeing with itself.
 */
export function appPcPreset(options: AppPcPresetOptions = {}): AdaptiveMatrixOptions {
  validateAppPcPresetOptions(options)
  const breakpoint = options.breakpoint ?? 768
  const appFluidMin = options.appFluidMin ?? 320
  const appFluidMax = options.appFluidMax ?? 480
  const pcFluidMin = options.pcFluidMin ?? 1024
  const pcFluidMax = options.pcFluidMax ?? 1920
  const rootEnabled =
    options.root ?? ROOT_PRESET_SETTING_KEYS.some((field) => options[field] !== undefined)

  if (appFluidMax <= appFluidMin) {
    throw new RangeError(
      '[postcss-adaptive-matrix] appPcPreset requires appFluidMax > appFluidMin.',
    )
  }
  if (pcFluidMax <= pcFluidMin) {
    throw new RangeError('[postcss-adaptive-matrix] appPcPreset requires pcFluidMax > pcFluidMin.')
  }

  // The `app` route is redundant while `defaultProfile` is `app`, and stops
  // being redundant the moment someone spreads this preset over a desktop-first
  // configuration. Both directions are stated so the pair keeps meaning what it
  // says under an override.
  const breakpointRoutes: AdaptiveRoute[] = [
    { media: { minWidth: breakpoint }, profile: 'pc' },
    { media: { maxWidth: breakpoint - 0.02 }, profile: 'app' },
  ]

  return {
    defaultProfile: 'app',
    routes: breakpointRoutes,
    profiles: {
      app: {
        designWidth: options.appDesignWidth ?? 375,
        fluid: { minWidth: appFluidMin, maxWidth: appFluidMax },
        query: `(max-width: ${breakpoint - 0.02}px)`,
        rootMaxWidth: appFluidMax,
      },
      pc: {
        designWidth: options.pcDesignWidth ?? 1440,
        fluid: { minWidth: pcFluidMin, maxWidth: pcFluidMax },
        query: `(min-width: ${breakpoint}px)`,
        rootMaxWidth: pcFluidMax,
      },
    },
    root: rootEnabled
      ? {
          selector: options.rootSelector ?? ':root',
          center: true,
          container: options.container ?? false,
          containerName: 'adaptive-root',
          safeAreaVariables: true,
          layer: options.rootLayer ?? 'adaptive-matrix',
          ...(options.rootLogical === undefined ? {} : { logical: options.rootLogical }),
          // On by default: both profiles above set `rootMaxWidth`, so this
          // preset is precisely the configuration in which a fixed element
          // stops agreeing with the page it sits on.
          fixedContainingBlock: options.fixedContainingBlock ?? true,
          ...(options.rootInjectTo ? { injectTo: options.rootInjectTo } : {}),
        }
      : false,
  }
}

/**
 * Theme-token families that hold a length on the design canvas.
 *
 * Current atomic CSS frameworks put the numbers here rather than in the utility
 * class: `.p-4` compiles to `padding: calc(var(--spacing) * 4)`, so reading the
 * utility finds no length at all and the whole scale has to be claimed at its
 * source. Multiplying through a `clamp()` is exact — `calc(clamp(a, b, c) * 4)`
 * is `clamp(4a, 4b, 4c)` for a positive factor — so the utilities come out
 * right without being touched.
 *
 * Deliberately absent:
 *
 *  - `--breakpoint-*`, which names the widths a canvas *switches* at. Scaling
 *    those would move the switch itself, and nothing downstream would say so.
 *  - `--tracking-*`, published in `em`, which already tracks a font size this
 *    compiler has made fluid. Scaling it again would compound.
 *  - `--shadow-*`, whose pixels are depth cues drawn at screen scale rather
 *    than measurements off the design file.
 */
const THEME_TOKEN_PREFIXES = [
  '--spacing',
  '--text-',
  '--leading-',
  '--radius-',
  '--container-',
] as const

/** Token families the accessible-text formula applies to. See `DEFAULTS.textProperties`. */
const THEME_TEXT_PROPERTIES = ['--text-*', '--leading-*']

/**
 * Adds what an atomic CSS framework needs on top of an existing configuration.
 *
 * Two things are missing by default, and both fail silently: the frameworks
 * write lengths in `rem` while the compiler reads `px`, and they hide the
 * scale behind theme tokens, which are never converted unless claimed. The
 * result is a build where hand-written CSS scales and every utility class does
 * not — no error, just two sets of sizes that no longer agree.
 *
 * Composes rather than replaces, so it wraps whatever you already had:
 *
 * ```js
 * adaptiveMatrix(withAtomicCss(appPcPreset({ rootSelector: '#app' })))
 * ```
 */
type AtomicCssConfiguration<T extends AdaptiveMatrixOptions> = Omit<
  T,
  'unitToConvert' | 'routes' | 'textProperties'
> & {
  unitToConvert: string[]
  routes: AdaptiveRoute[]
  textProperties?: string[]
}

/** Zero-config atomic CSS adaptation, using the compiler's built-in canvases. */
export function withAtomicCss(): AtomicCssConfiguration<AdaptiveMatrixOptions>
/** Customises atomic CSS defaults without requiring an empty base object. */
export function withAtomicCss(
  options: AtomicCssOptions,
): AtomicCssConfiguration<AdaptiveMatrixOptions>
/** Adds atomic CSS support without losing the caller's precise configuration type. */
export function withAtomicCss<T extends AdaptiveMatrixOptions>(
  base: T,
  options?: AtomicCssOptions,
): AtomicCssConfiguration<T>
export function withAtomicCss<T extends AdaptiveMatrixOptions>(
  baseOrOptions: T | AtomicCssOptions = {},
  explicitOptions?: AtomicCssOptions,
): AtomicCssConfiguration<T> {
  // `profile` and `tokenPrefixes` are not AdaptiveMatrixOptions fields, so a
  // one-argument call carrying either is unambiguous. `{}` remains a base, but
  // the result is identical either way. Two arguments always use the original
  // base/options form, even if a caller-owned base has extra runtime fields.
  // An explicitly passed `undefined` followed the old default-parameter path
  // and therefore means "use defaults"; `null` remains an authored invalid
  // value and must still reach validation.
  const hasExplicitOptions = explicitOptions !== undefined
  const optionsOnly =
    !hasExplicitOptions &&
    isObject(baseOrOptions) &&
    ('profile' in baseOrOptions || 'tokenPrefixes' in baseOrOptions)
  const base = (optionsOnly ? {} : baseOrOptions) as T
  const options = (
    optionsOnly ? baseOrOptions : hasExplicitOptions ? explicitOptions : {}
  ) as AtomicCssOptions
  validateAtomicCssBase(base)
  validateAtomicCssOptions(options)
  const units =
    base.unitToConvert === undefined
      ? ['px']
      : typeof base.unitToConvert === 'string'
        ? [base.unitToConvert]
        : [...base.unitToConvert]
  if (!units.some((unit) => unit.toLowerCase() === 'rem')) units.push('rem')

  const prefixes = [...new Set([...THEME_TOKEN_PREFIXES, ...(options.tokenPrefixes ?? [])])]
  const inheritedTextProperties =
    base.textProperties === undefined
      ? undefined
      : typeof base.textProperties === 'string'
        ? [base.textProperties]
        : [...base.textProperties]

  return {
    ...base,
    unitToConvert: units,
    // Appended, so anything the caller routed by hand is tested first — the
    // same order library routes take, and for the same reason.
    routes: [
      ...(base.routes ?? []),
      {
        profile: options.profile ?? base.defaultProfile ?? 'app',
        property: prefixes,
      },
    ],
    // Only when the caller took the list over; the defaults already carry these.
    ...(inheritedTextProperties
      ? {
          textProperties: [
            ...inheritedTextProperties,
            ...THEME_TEXT_PROPERTIES.filter((entry) => !inheritedTextProperties.includes(entry)),
          ],
        }
      : {}),
  }
}

export const presets = Object.freeze({ appPc: appPcPreset })
