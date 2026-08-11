import { matchesAnyPattern, matchesFile, toArray } from './matchers.js'
import { routingSelector } from './selectors.js'
import type { WidthBand } from './media.js'
import type {
  ActiveProfile,
  AdaptiveRoute,
  MediaMatcher,
  ResolvedAdaptiveMatrixOptions,
} from './types.js'

/**
 * True when the rule cannot apply outside the band the matcher describes.
 *
 * Implication, not equality: `{ minWidth: 1024 }` is satisfied by a rule live
 * from 1200px up. The test is one-sided on purpose — a route says "this canvas
 * covers these widths", and a rule confined to part of that range is still
 * covered.
 */
function bandSatisfies(band: WidthBand, matcher: MediaMatcher): boolean {
  if (matcher.minWidth !== undefined && band.lo < matcher.minWidth) return false
  if (matcher.maxWidth !== undefined && band.hi > matcher.maxWidth) return false
  return true
}

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
      throw new Error(`[postcss-adaptive-matrix] Route targets unknown profile "${route.profile}".`)
    })
    .map((route) => ({
      profile: route.profile,
      file: toArray(route.file),
      selector: toArray(route.selector),
      property: toArray(route.property).map((prefix) => prefix.toLowerCase()),
      media: toArray(route.media),
    }))

  const hasSelectorRoutes = routes.some((route) => route.selector.length > 0)
  const propertyRoutes = routes.filter((route) => route.property.length > 0)
  // Only routes that ask for nothing but a width band can be settled on the way
  // into an `@media` block. One that also names a selector is a refinement of a
  // rule, and waits for `forSelector`.
  const mediaRoutes = routes.filter(
    (route) => route.media.length > 0 && !route.selector.length && !route.property.length,
  )

  /** `null` is an unreadable query — no band matches it, so no route claims it. */
  function inBand(route: { media: MediaMatcher[] }, band: WidthBand | null): boolean {
    if (!route.media.length) return true
    return band !== null && route.media.some((matcher) => bandSatisfies(band, matcher))
  }

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
    /** True when enclosing media queries need to be parsed at all. */
    hasMediaRoutes: routes.some((route) => route.media.length > 0),

    /** Profile for a whole stylesheet, before any selector is known. */
    forFile(file: string): ActiveProfile {
      for (const route of routes) {
        if (route.selector.length || route.property.length || route.media.length) continue
        if (matchesFile(route.file, file)) return activate(route.profile)
      }
      return fallback
    },

    /**
     * Refines the choice on the way into an `@media` block.
     *
     * This is what puts a responsive stylesheet's desktop breakpoint on the
     * desktop design file. It runs on entry rather than per rule so that the
     * whole block inherits the canvas, exactly as an `@adaptive` block would —
     * and so that a selector route inside it can still override, since a
     * component library is drawn on its own canvas at every viewport width.
     */
    forMedia(inherited: ActiveProfile, band: WidthBand | null, file: string): ActiveProfile {
      if (inherited.explicit || !mediaRoutes.length) return inherited
      for (const route of mediaRoutes) {
        if (!inBand(route, band)) continue
        if (route.file.length && !matchesFile(route.file, file)) continue
        return activate(route.profile)
      }
      return inherited
    },

    /**
     * Refines a file-level choice once a selector is known. `inherited` is
     * returned untouched when it came from `@adaptive` or when nothing matches.
     *
     * Takes the selector as authored and reduces it to what it is *about*
     * before matching — see `routingSelector`. Doing that here rather than in
     * the caller keeps it out of the way when no route tests selectors at all,
     * which is the whole cost of the feature for a project that disables it.
     *
     * A route may name a width band as well, which then has to hold too — that
     * is how "this component is redrawn at the desktop breakpoint" is said.
     */
    forSelector(
      inherited: ActiveProfile,
      selector: string,
      file: string,
      band: WidthBand | null = null,
    ): ActiveProfile {
      if (inherited.explicit || !hasSelectorRoutes) return inherited
      const subject = routingSelector(selector)
      for (const route of routes) {
        if (!route.selector.length) continue
        if (!matchesAnyPattern(route.selector, subject)) continue
        if (route.file.length && !matchesFile(route.file, file)) continue
        if (!inBand(route, band)) continue
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
    forCustomProperty(
      inherited: ActiveProfile,
      property: string,
      file: string,
      band: WidthBand | null = null,
    ): ActiveProfile | undefined {
      if (inherited.explicit || !propertyRoutes.length) return undefined
      const lowered = property.toLowerCase()
      for (const route of propertyRoutes) {
        if (!route.property.some((prefix) => lowered.startsWith(prefix))) continue
        if (route.file.length && !matchesFile(route.file, file)) continue
        if (!inBand(route, band)) continue
        return activate(route.profile)
      }
      return undefined
    },
  }
}

export type ProfileResolver = ReturnType<typeof createProfileResolver>

export type { AdaptiveRoute }
