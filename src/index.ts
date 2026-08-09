import { adaptiveMatrix } from './postcss/plugin.js'
import type { AdaptiveMatrixOptions } from './core/types.js'

export { adaptiveMatrix }
export { appPcPreset, presets } from './core/presets.js'
export { BUILT_IN_LIBRARIES, defineLibraries } from './core/libraries.js'
// Exported so a build can fail on what the CLI only prints. The check reads a
// compiled `Root`, so it slots in as a PostCSS plugin of your own after this
// one, or as an assertion in a visual-regression suite.
export { findContinuityIssues } from './core/continuity.js'
export type { ContinuityIssue } from './core/continuity.js'

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
