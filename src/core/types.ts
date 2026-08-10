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
  /**
   * Canvas the non-fluid half of a text size is measured against. Defaults to
   * `designWidth`.
   *
   * Text keeps part of its size in `rem` so browser zoom still reaches it, and
   * that part is a fixed length — it does not scale with the viewport, so it
   * has to be pinned to *some* width. Pinning it to the profile's own canvas is
   * right for a canvas that means what it says: 16px on a 1440 desktop design
   * is 16px at 1440.
   *
   * It is wrong for a canvas that is a re-description of the same design at a
   * different scale. Vant's 375 canvas next to a page drawn on 750 describes
   * one design in two unit systems, where Vant's 16px and the page's 32px are
   * the same size; anchoring each to its own canvas makes the `rem` halves
   * differ by a factor of two and the two never agree at any viewport. Library
   * canvases therefore inherit the anchor of the profile they derive from.
   *
   * Purely fluid lengths are unaffected: with no static half there is nothing
   * to anchor, which is why ordinary lengths already agreed across canvases.
   */
  textAnchorWidth?: number | ((context: ProfileContext) => number)
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
  file?: FileMatcher | readonly FileMatcher[]
  selector?: Pattern | readonly Pattern[]
  /** Custom-property prefixes, e.g. `--van-`. Routes tokens declared on `:root`. */
  property?: string | readonly string[]
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
  prefix?: string | readonly string[]
  /**
   * Custom-property prefixes, e.g. `--van-`.
   *
   * Libraries themed through custom properties declare them on `:root`, which
   * carries no class prefix. Converting the token declaration once makes every
   * `var()` reference fluid without rewriting a single component rule.
   */
  tokenPrefix?: string | readonly string[]
  /** Paths, for builds that keep vendor CSS in its own files. */
  file?: FileMatcher | readonly FileMatcher[]
  /**
   * Requires `file` to match before `prefix` or `tokenPrefix` count.
   *
   * Normally a class prefix routes on its own, so vendor CSS still lands on the
   * right canvas after a bundler inlines it and the path is gone. That breaks
   * down when one prefix spans two canvases: antd-mobile publishes the same
   * `.adm-` classes twice, drawn for 375 under `bundle/` and for 750 under
   * `2x/`, and a prefix alone cannot say which of the two a rule came from.
   * Scoping the prefix to the path lets both be described at once.
   *
   * Scoped routes are tested before unscoped ones, being the more specific
   * claim. So a scoped variant wins wherever its path matches, and the plain
   * entry still catches the same classes everywhere else.
   */
  scoped?: boolean
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
   * Whether the foundation writes logical properties. Defaults to true.
   *
   * `inline-size`, `margin-inline` and `max-inline-size` say the same thing as
   * `width`, `margin-left`/`margin-right` and `max-width` for as long as the
   * page runs left-to-right, and something better once it does not. They are
   * also the newest thing the foundation depends on when nothing else is
   * enabled, and the failure is the quiet kind: a browser that cannot read
   * `margin-inline: auto` drops that declaration alone, leaving a column of
   * exactly the right width pinned to the left edge of the screen.
   *
   * Set to false to write the physical spellings instead. On a horizontal page
   * this costs nothing.
   */
  logical?: boolean
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
  injectTo?: FileMatcher | readonly FileMatcher[]
}

export interface AdaptiveMatrixOptions {
  profiles?: Record<string, AdaptiveProfile>
  defaultProfile?: string
  /** Evaluated in order; the first match wins. `@adaptive` always outranks these. */
  routes?: readonly AdaptiveRoute[]
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
  libraries?: readonly LibraryEntry[] | 'auto' | false
  atRuleName?: string
  strategy?: OutputStrategy
  unit?: ScaleUnit
  precision?: number
  /**
   * Units read as design-canvas lengths. An array reads several in one pass,
   * which is what a project mixing hand-written CSS with an atomic framework
   * needs: Tailwind and UnoCSS write spacing and type in `rem` but borders and
   * arbitrary values like `p-[13px]` in `px`, so both units appear in the same
   * stylesheet and both describe the same design.
   *
   * `rem` is read as `rootValue` pixels. Every other unit is read at face
   * value — `em` deliberately included, since it answers to whatever font size
   * the element inherited and no build-time number can stand in for that.
   */
  unitToConvert?: string | readonly string[]
  /**
   * Pixels per `rem`, used both when reading `rem` input and when writing the
   * static half of a text length. Defaults to 16, the initial value browsers
   * ship; change it only if the page actually sets a different root font size.
   */
  rootValue?: number
  minPixelValue?: number
  /** Values with an absolute size at or below this number stay in px. */
  hairline?: number
  fontFluidity?: number
  textProperties?: readonly string[]
  propList?: readonly string[]
  selectorExclude?: readonly Pattern[]
  valueExclude?: readonly Pattern[]
  include?: FileMatcher | readonly FileMatcher[]
  exclude?: FileMatcher | readonly FileMatcher[]
  transformCustomProperties?: boolean
  preserveOriginal?: boolean
  root?: RootFoundationOptions | false
  unknownProfile?: 'warn' | 'error' | 'ignore'
}

export interface ResolvedAdaptiveMatrixOptions
  extends Omit<
    Required<AdaptiveMatrixOptions>,
    'root' | 'include' | 'exclude' | 'libraries' | 'unitToConvert'
  > {
  /** Normalised to a list; a single unit resolves to a one-element array. */
  unitToConvert: string[]
  root: RootFoundationOptions | false
  include?: FileMatcher | readonly FileMatcher[]
  exclude?: FileMatcher | readonly FileMatcher[]
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
  /**
   * Cascade layer the foundation is written into, or false for no layer.
   * Defaults to `'adaptive-matrix'`. See `RootFoundationOptions.layer`.
   *
   * Present on the preset because it is a support switch as much as a cascade
   * one: a browser without `@layer` drops the whole block, and reaching that
   * switch should not require abandoning the preset. Same for `rootLogical`.
   */
  rootLayer?: string | false
  /** Whether the foundation writes logical properties. See `RootFoundationOptions.logical`. */
  rootLogical?: boolean
}

export interface AtomicCssOptions {
  /**
   * Canvas the theme tokens are drawn on. Defaults to the base configuration's
   * `defaultProfile`, which is right whenever the utilities are used across the
   * whole application rather than on one side of a breakpoint.
   */
  profile?: string
  /**
   * Further custom-property prefixes to claim, for a theme extended with length
   * families of its own — `--size-`, `--gutter-`, whatever `@theme` declares.
   */
  tokenPrefixes?: readonly string[]
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
