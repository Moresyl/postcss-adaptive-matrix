import { adaptiveMatrix } from './postcss/plugin.js'
import type { AdaptiveMatrixOptions } from './core/types.js'

export { adaptiveMatrix }
export { compileAdaptiveCss, createAdaptiveCompiler } from './compile.js'
export type {
  AdaptiveCompileOptions,
  AdaptiveCompileResult,
  AdaptiveCompileGate,
  AdaptiveCompileGateCategory,
} from './compile.js'
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
export { CLI_REPORT_FORMAT_VERSION } from './core/report.js'
export type {
  CliCompatibilityReport,
  CliDeclarationChange,
  CliErrorReport,
  CliFileReport,
  CliJsonReport,
  CliQualityGateCategory,
  CliQualityGateReport,
  CliReportSummary,
  CliSuccessReport,
} from './core/report.js'

/** Returns the default configuration shape when no overrides are needed. */
export function defineConfig(): AdaptiveMatrixOptions
/** Preserves literal types while checking an authored configuration. */
export function defineConfig<T extends AdaptiveMatrixOptions>(config: T): T
export function defineConfig(config: AdaptiveMatrixOptions = {}): AdaptiveMatrixOptions {
  return config
}

export type {
  ActiveProfile,
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveProfileInput,
  AdaptiveQuery,
  AdaptiveRoute,
  AppPcPresetOptions,
  AtomicCssOptions,
  FileMatcher,
  LibraryAdaptation,
  LibraryAdaptationOptions,
  LibraryEntry,
  MediaMatcher,
  OutputStrategy,
  Pattern,
  ProfileContext,
  QueryType,
  ResolvedAdaptiveMatrixOptions,
  ResolvedLibraryAdaptation,
  ResolvedRootFoundationOptions,
  RootValueContext,
  RootValueResolver,
  RootFoundationOptions,
  ScaleUnit,
} from './core/types.js'

export default adaptiveMatrix
