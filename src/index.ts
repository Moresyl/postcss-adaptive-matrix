import { adaptiveMatrix } from './postcss/plugin.js'
import type { AdaptiveMatrixOptions } from './core/types.js'

export { adaptiveMatrix }
export { appPcPreset, presets } from './core/presets.js'
export { BUILT_IN_LIBRARIES, defineLibraries } from './core/libraries.js'

export function defineConfig<T extends AdaptiveMatrixOptions>(config: T): T {
  return config
}

export type {
  ActiveProfile,
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveQuery,
  AdaptiveRoute,
  AppPcPresetOptions,
  FileMatcher,
  LibraryAdaptation,
  OutputStrategy,
  Pattern,
  ProfileContext,
  QueryType,
  ResolvedAdaptiveMatrixOptions,
  RootFoundationOptions,
  ScaleUnit,
} from './core/types.js'

export default adaptiveMatrix
