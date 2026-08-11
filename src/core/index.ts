/**
 * The compiler core.
 *
 * Nothing in this directory imports a CSS parser. Everything here is a pure
 * function over strings, numbers and plain options, which is what makes the
 * transform reusable outside PostCSS and testable without a host.
 */
export { convertLength, convertValue, round } from './convert.js'
export { adaptiveQueryParams, buildFoundationCss } from './foundation.js'
export {
  createPropertyMatcher,
  matchesAnyPattern,
  matchesFile,
  matchesPattern,
} from './matchers.js'
export {
  BUILT_IN_LIBRARIES,
  defineLibraries,
  expandLibraries,
  libraryProfileName,
  resolveLibrary,
} from './libraries.js'
export { resolveOptions } from './options.js'
export { appPcPreset, presets } from './presets.js'
export { createProfileResolver, type ProfileResolver } from './resolve.js'
export type {
  ActiveProfile,
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveQuery,
  AdaptiveRoute,
  AppPcPresetOptions,
  FileMatcher,
  LibraryAdaptation,
  MediaMatcher,
  OutputStrategy,
  Pattern,
  ProfileContext,
  QueryType,
  ResolvedAdaptiveMatrixOptions,
  RootFoundationOptions,
  ScaleUnit,
} from './types.js'
