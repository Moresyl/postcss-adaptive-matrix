import { matchesAnyPattern, matchesFile, toArray } from './matchers.js'
import type {
  ActiveProfile,
  AdaptiveRoute,
  Pattern,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

/**
 * Decides which design canvas a piece of CSS belongs to.
 *
 * Precedence, highest first:
 *   1. an enclosing `@adaptive <profile>` block — the author said so explicitly
 *   2. a route matching the custom property being declared
 *   3. a route matching the selector — survives bundlers that inline vendor CSS
 *   4. a route matching the file path
 *   5. `defaultProfile`
 *
 * Selector routes outrank file routes because a selector is a property of the
 * CSS itself, while a path is a property of how the build happened to lay it
 * out. Property routes outrank both for the same reason, only more so: a
 * library's theme tokens are declared on `:root`, which carries no evidence of
 * where they came from except their own names.
 */
export function createProfileResolver(options: ResolvedAdaptiveMatrixOptions) {
  const fallback: ActiveProfile = {
    name: options.defaultProfile,
    profile: options.profiles[options.defaultProfile]!,
    explicit: false,
    convert: true,
  }

  const routes = options.routes
    .filter((route) => {
      if (route.profile === false || options.profiles[route.profile]) return true
      throw new Error(
        `[postcss-adaptive-matrix] Route targets unknown profile "${route.profile}".`,
      )
    })
    .map((route) => ({
      profile: route.profile,
      file: toArray(route.file),
      selector: toArray(route.selector) as Pattern[],
      property: toArray(route.property).map((prefix) => prefix.toLowerCase()),
    }))

  const hasSelectorRoutes = routes.some((route) => route.selector.length > 0)
  const propertyRoutes = routes.filter((route) => route.property.length > 0)

  /**
   * A route that declares a file must still match it. `preserve` routes reuse
   * the default profile object because nothing will read it.
   */
  function activate(profile: string | false): ActiveProfile {
    if (profile === false) return { ...fallback, convert: false }
    return { name: profile, profile: options.profiles[profile]!, explicit: false, convert: true }
  }

  return {
    /** True when selectors need to be tested at all — lets callers skip the work. */
    hasSelectorRoutes,
    /** True when custom-property names need to be tested at all. */
    hasPropertyRoutes: propertyRoutes.length > 0,

    /** Profile for a whole stylesheet, before any selector is known. */
    forFile(file: string): ActiveProfile {
      for (const route of routes) {
        if (route.selector.length || route.property.length) continue
        if (matchesFile(route.file, file)) return activate(route.profile)
      }
      return fallback
    },

    /**
     * Refines a file-level choice once a selector is known. `inherited` is
     * returned untouched when it came from `@adaptive` or when nothing matches.
     */
    forSelector(inherited: ActiveProfile, selector: string, file: string): ActiveProfile {
      if (inherited.explicit || !hasSelectorRoutes) return inherited
      for (const route of routes) {
        if (!route.selector.length) continue
        if (!matchesAnyPattern(route.selector, selector)) continue
        if (route.file.length && !matchesFile(route.file, file)) continue
        return activate(route.profile)
      }
      return inherited
    },

    /**
     * Canvas for a custom property, or `undefined` when no route claims it.
     *
     * Returning `undefined` rather than the inherited profile is what lets the
     * caller tell "this is a library token, convert it" apart from "this is an
     * ordinary custom property, obey `transformCustomProperties`".
     */
    forCustomProperty(inherited: ActiveProfile, property: string, file: string): ActiveProfile | undefined {
      if (inherited.explicit || !propertyRoutes.length) return undefined
      const lowered = property.toLowerCase()
      for (const route of propertyRoutes) {
        if (!route.property.some((prefix) => lowered.startsWith(prefix))) continue
        if (route.file.length && !matchesFile(route.file, file)) continue
        return activate(route.profile)
      }
      return undefined
    },
  }
}

export type ProfileResolver = ReturnType<typeof createProfileResolver>

export type { AdaptiveRoute }
