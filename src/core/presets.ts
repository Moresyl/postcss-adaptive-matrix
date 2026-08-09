import type { AdaptiveMatrixOptions, AppPcPresetOptions } from './types.js'

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
        }
      : false,
  }
}

export const presets = Object.freeze({ appPc: appPcPreset })
