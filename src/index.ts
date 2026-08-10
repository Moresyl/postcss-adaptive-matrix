import { adaptiveMatrix } from './postcss/plugin.js'
import type { AdaptiveMatrixOptions } from './core/types.js'

export { adaptiveMatrix }
export { appPcPreset, presets, withAtomicCss } from './core/presets.js'
export { BUILT_IN_LIBRARIES, defineLibraries } from './core/libraries.js'
// Exported so a build can fail on what the CLI only prints. The check reads a
// compiled `Root`, so it slots in as a PostCSS plugin of your own after this
// one, or as an assertion in a visual-regression suite.
export { findContinuityIssues } from './core/continuity.js'
export type { ContinuityIssue } from './core/continuity.js'
// Same reasoning, for browser support: the audit reads compiled CSS text, so a
// build can assert on it without this package having any say in the matter.
export {
  auditCompatibility,
  compatFeature,
  detectFeatures,
  COMPAT_FEATURES,
  FEATURE_SUPPORT,
} from './core/compat.js'
export type {
  CompatAudit,
  CompatFeature,
  CompatFeatureId,
  CompatFinding,
  CompatShortfall,
} from './core/compat.js'

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
  AtomicCssOptions,
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
