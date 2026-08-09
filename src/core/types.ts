export type Pattern = string | RegExp
export type FileMatcher = Pattern | ((file: string) => boolean)
export type QueryType = 'media' | 'container'
export type ScaleUnit = 'vw' | 'vi' | 'cqw' | 'cqi'
export type OutputStrategy = 'clamp' | 'viewport'

export interface ProfileContext {
  file: string
  profile: string
}

export interface AdaptiveQuery {
  type?: QueryType
  condition: string
  name?: string
}

export interface AdaptiveProfile {
  /** Width of the design canvas used while authoring this profile. */
  designWidth: number | ((context: ProfileContext) => number)
  /** Viewport/container interval in which lengths are allowed to scale. */
  fluid: {
    minWidth: number
    maxWidth: number
  }
  /** Wrapper generated for `@adaptive <profile>`. `false` unwraps it. */
  query?: string | AdaptiveQuery | false
  /** Width unit used by the preferred fluid expression. */
  unit?: ScaleUnit
  strategy?: OutputStrategy
  /** 0 is static text, 1 is pure viewport text. Kept below 1 for zoom support. */
  fontFluidity?: number
  /** Optional maximum width applied to the configured root inside this profile. */
  rootMaxWidth?: number
}

/**
 * Sends matching stylesheets or selectors to a profile other than the default.
 *
 * This is what lets a dependency authored against a different design canvas
 * live in the same build as first-party code. Selector matching exists because
 * a bundler may inline that dependency, which erases the file path.
 */
export interface AdaptiveRoute {
  /** Target profile, or `false` to leave matching lengths in fixed pixels. */
  profile: string | false
  file?: FileMatcher | FileMatcher[]
  selector?: Pattern | Pattern[]
  /** Custom-property prefixes, e.g. `--van-`. Routes tokens declared on `:root`. */
  property?: string | string[]
}

/**
 * Adapts a third-party component library instead of excluding it.
 *
 * A library ships CSS authored against its own canvas. Excluding it leaves it
 * fixed while the page around it scales; converting it on the *page's* canvas
 * distorts it. Both are wrong, and both are what a plain ignore-list forces.
 * Giving the library its own canvas is what actually makes it fit.
 */
export interface LibraryAdaptation {
  /** Used in the derived profile name and in diagnostics. */
  name: string
  /**
   * Built-in to start from, so a single field can be corrected without
   * restating the rest. Useful when a project themes a library onto its own
   * canvas, e.g. `{ extends: 'vant', designWidth: 750 }`.
   */
  extends?: string
  /**
   * Canvas the library was authored against, or `false` to keep its lengths in
   * fixed pixels — the right answer for desktop libraries sized in real pixels.
   */
  designWidth: number | false
  /** Class prefixes, without the dot. Matched on selectors, so inlined CSS still routes. */
  prefix?: string | string[]
  /**
   * Custom-property prefixes, e.g. `--van-`.
   *
   * Libraries themed through custom properties declare them on `:root`, which
   * carries no class prefix. Converting the token declaration once makes every
   * `var()` reference fluid without rewriting a single component rule.
   */
  tokenPrefix?: string | string[]
  /** Paths, for builds that keep vendor CSS in its own files. */
  file?: FileMatcher | FileMatcher[]
  /** Profile whose fluid range, unit and strategy the derived canvas borrows. */
  basedOn?: string
}

/**
 * One entry of the `libraries` option: a built-in name, a full definition, or a
 * correction layered onto a built-in.
 */
export type LibraryEntry =
  | string
  | LibraryAdaptation
  | (Partial<LibraryAdaptation> & { extends: string })

export interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
  /**
   * Keeps `position: fixed` descendants aligned to the root column.
   *
   * Only meaningful alongside a profile that sets `rootMaxWidth`, since that is
   * what turns the page into a centred column and leaves fixed elements
   * measuring themselves against the whole viewport instead.
   */
  fixedContainingBlock?: boolean
  /**
   * Which files receive the foundation. Defaults to all of them.
   *
   * The foundation is global CSS, but PostCSS sees one file at a time and has
   * no way to dedupe across them. A project with a single stylesheet wants a
   * copy in that one file, which is why the default is unrestricted. A Vue or
   * Svelte project is the opposite case: every component's `<style>` block is
   * its own file, so the default leaves a copy of the safe-area variables and
   * the root column rules in every component.
   *
   * Point this at the entry stylesheet to emit it exactly once. Matching works
   * like `include`: a string is a substring test, a regular expression is
   * tested against the path, a function decides for itself.
   */
  injectTo?: FileMatcher | FileMatcher[]
}

export interface AdaptiveMatrixOptions {
  profiles?: Record<string, AdaptiveProfile>
  defaultProfile?: string
  /** Evaluated in order; the first match wins. `@adaptive` always outranks these. */
  routes?: AdaptiveRoute[]
  /**
   * Component libraries to adapt.
   *
   * Defaults to `'auto'`: every built-in is active, so a project using Vant or
   * Element Plus needs no configuration at all. Libraries whose class prefix is
   * too generic to be safe unattended are matched by path only until named
   * explicitly. Pass `false` to turn the whole mechanism off.
   *
   * Entries expand into routes evaluated after `routes`, so an explicit route
   * always wins.
   */
  libraries?: LibraryEntry[] | 'auto' | false
  atRuleName?: string
  strategy?: OutputStrategy
  unit?: ScaleUnit
  precision?: number
  unitToConvert?: string
  minPixelValue?: number
  /** Values with an absolute size at or below this number stay in px. */
  hairline?: number
  fontFluidity?: number
  textProperties?: string[]
  propList?: string[]
  selectorExclude?: Pattern[]
  valueExclude?: Pattern[]
  include?: FileMatcher | FileMatcher[]
  exclude?: FileMatcher | FileMatcher[]
  transformCustomProperties?: boolean
  preserveOriginal?: boolean
  root?: RootFoundationOptions | false
  unknownProfile?: 'warn' | 'error' | 'ignore'
}

export interface ResolvedAdaptiveMatrixOptions
  extends Omit<
    Required<AdaptiveMatrixOptions>,
    'root' | 'include' | 'exclude' | 'libraries'
  > {
  root: RootFoundationOptions | false
  include?: FileMatcher | FileMatcher[]
  exclude?: FileMatcher | FileMatcher[]
  /** Built-in names already looked up, so nothing downstream consults the registry. */
  libraries: LibraryAdaptation[]
}

export interface AppPcPresetOptions {
  appDesignWidth?: number
  pcDesignWidth?: number
  breakpoint?: number
  appFluidMin?: number
  appFluidMax?: number
  pcFluidMin?: number
  pcFluidMax?: number
  rootSelector?: string
  container?: boolean
  /**
   * Defaults to true, because this preset is what creates the centred column
   * that `position: fixed` would otherwise escape. Set false to keep fixed
   * elements measured against the viewport.
   */
  fixedContainingBlock?: boolean
  /** Restricts the root foundation to matching files. See `RootFoundationOptions.injectTo`. */
  rootInjectTo?: FileMatcher | FileMatcher[]
}

/** A profile together with how it was selected. */
export interface ActiveProfile {
  name: string
  profile: AdaptiveProfile
  /** True when `@adaptive` named it, which makes routing rules non-binding. */
  explicit: boolean
  /** False when a route asked for these lengths to stay in fixed pixels. */
  convert: boolean
}
