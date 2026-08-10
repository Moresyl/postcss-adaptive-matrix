import type {
  AdaptiveMatrixOptions,
  AdaptiveRoute,
  AppPcPresetOptions,
  AtomicCssOptions,
} from './types.js'

/**
 * A practical two-canvas preset: author the app at 375px and desktop at 1440px.
 * The breakpoint and both fluid ranges remain configurable.
 */
export function appPcPreset(
  options: AppPcPresetOptions = {},
): AdaptiveMatrixOptions {
  const breakpoint = options.breakpoint ?? 768
  const appFluidMin = options.appFluidMin ?? 320
  const appFluidMax = options.appFluidMax ?? 480
  const pcFluidMin = options.pcFluidMin ?? 1024
  const pcFluidMax = options.pcFluidMax ?? 1920

  return {
    defaultProfile: 'app',
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
    root: options.rootSelector
      ? {
          selector: options.rootSelector,
          center: true,
          container: options.container ?? false,
          containerName: 'adaptive-root',
          safeAreaVariables: true,
          layer: 'adaptive-matrix',
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
export function withAtomicCss<T extends AdaptiveMatrixOptions>(
  base: T,
  options: AtomicCssOptions = {},
): T & { unitToConvert: string[]; routes: AdaptiveRoute[] } {
  const units =
    base.unitToConvert === undefined
      ? ['px']
      : typeof base.unitToConvert === 'string'
        ? [base.unitToConvert]
        : [...base.unitToConvert]
  if (!units.some((unit) => unit.toLowerCase() === 'rem')) units.push('rem')

  const prefixes = [...THEME_TOKEN_PREFIXES, ...(options.tokenPrefixes ?? [])]

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
    ...(base.textProperties
      ? {
          textProperties: [
            ...base.textProperties,
            ...THEME_TEXT_PROPERTIES.filter(
              (entry) => !base.textProperties!.includes(entry),
            ),
          ],
        }
      : {}),
  }
}

export const presets = Object.freeze({ appPc: appPcPreset })
