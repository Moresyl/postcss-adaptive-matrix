import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveRoute,
  LibraryAdaptation,
  LibraryEntry,
} from './types.js'

/**
 * Built-in adaptations for widely used component libraries.
 *
 * Two admission rules keep this list trustworthy rather than merely long:
 *
 *  - the class prefix must be unambiguous. A prefix like `.p-` or `.v-` collides
 *    with utility frameworks and application code, and a false match silently
 *    rescales the wrong element — worse than no entry at all.
 *  - the treatment must be documented by the library, not inferred. Mobile kits
 *    publish the canvas they were drawn on; desktop kits are drawn in real
 *    pixels and are listed as `false` so their lengths survive untouched.
 *
 * Anything not listed is one object away: pass a `LibraryAdaptation` directly.
 */
interface RegistryEntry extends LibraryAdaptation {
  /**
   * False when the class prefix is too short to enable without being asked.
   *
   * `.n-`, `.q-` and `.at-` are real prefixes, but they also look exactly like
   * ordinary application or utility classes. A wrong match is silent — it
   * rescales an element on the wrong canvas, or skips one that needed scaling —
   * so in automatic mode these libraries are found by path only. Naming one
   * explicitly is the signal that its prefix is safe in *your* codebase.
   */
  autoPrefix?: boolean
}

const REGISTRY: Record<string, RegistryEntry> = {
  vant: {
    name: 'vant',
    designWidth: 375,
    prefix: 'van-',
    tokenPrefix: '--van-',
    file: [/[\\/]vant[\\/]/],
  },
  nutui: {
    name: 'nutui',
    designWidth: 375,
    prefix: 'nut-',
    tokenPrefix: '--nut-',
    file: [/[\\/]@nutui[\\/]/],
  },
  varlet: {
    // No `tokenPrefix`. Varlet names its custom properties after the component
    // and nothing else — `--field-padding`, `--icon-size-md`, `--card-width` —
    // declared on a bare `:root`. Claiming those by name would mean claiming
    // `--card-width` in general, which any application may define for itself,
    // and the registry only takes prefixes nobody else can plausibly own. Its
    // own stylesheet still routes by path; a theme override written in project
    // CSS needs an explicit route.
    name: 'varlet',
    designWidth: 375,
    prefix: 'var-',
    file: [/[\\/]@varlet[\\/]/],
  },
  'antd-mobile': {
    name: 'antd-mobile',
    designWidth: 375,
    prefix: 'adm-',
    tokenPrefix: '--adm-',
    // Anything but the 2x tree, which is the same CSS drawn twice as large.
    file: [/[\\/]antd-mobile[\\/](?!2x[\\/])/],
  },
  'antd-mobile-2x': {
    // antd-mobile publishes its stylesheet twice: `bundle/` drawn for 375 and
    // `2x/bundle/` drawn for 750, class for class and token for token. Only the
    // path tells them apart, so this entry is scoped to it — without that, the
    // `.adm-` route above would claim the 2x rules and render every length at
    // double size, silently and everywhere.
    name: 'antd-mobile-2x',
    designWidth: 750,
    prefix: 'adm-',
    tokenPrefix: '--adm-',
    file: [/[\\/]antd-mobile[\\/]2x[\\/]/],
    scoped: true,
  },
  'taro-ui': {
    name: 'taro-ui',
    designWidth: 750,
    prefix: 'at-',
    autoPrefix: false,
    file: [/[\\/]taro-ui[\\/]/],
  },

  // Desktop kits below. These are authored in real pixels against no canvas,
  // so the correct adaptation is to leave them alone.
  'element-plus': {
    name: 'element-plus',
    designWidth: false,
    prefix: 'el-',
    tokenPrefix: '--el-',
    file: [/[\\/]element-(?:plus|ui)[\\/]/],
  },
  antd: {
    name: 'antd',
    designWidth: false,
    prefix: 'ant-',
    file: [/[\\/]antd[\\/]/],
  },
  'arco-design': {
    name: 'arco-design',
    designWidth: false,
    prefix: 'arco-',
    file: [/[\\/]@arco-design[\\/]/],
  },
  'naive-ui': {
    name: 'naive-ui',
    designWidth: false,
    prefix: 'n-',
    autoPrefix: false,
    file: [/[\\/]naive-ui[\\/]/],
  },
  quasar: {
    name: 'quasar',
    designWidth: false,
    prefix: 'q-',
    autoPrefix: false,
    file: [/[\\/]quasar[\\/]/],
  },
  mui: {
    name: 'mui',
    designWidth: false,
    prefix: 'Mui',
    file: [/[\\/]@mui[\\/]/],
  },
}

export const BUILT_IN_LIBRARIES = Object.freeze(Object.keys(REGISTRY).sort())

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Matches a class prefix anywhere a class can appear.
 *
 * The leading dot is what keeps this honest: `.van-cell` and `.page .van-cell`
 * match, while an application class such as `.caravan-slot` does not.
 *
 * Returned as a plain string rather than a regex because a string pattern is
 * tested with `includes`, which means the same thing here and costs far less.
 * Selector routes are tested against every rule in the stylesheet, so a library
 * list is only free if this stays cheap.
 */
function prefixPattern(prefix: string): string {
  return `.${prefix.replace(/^\./, '')}`
}

function unknownLibrary(name: string): Error {
  return new Error(
    `[postcss-adaptive-matrix] Unknown library "${name}". Built-in libraries: ${BUILT_IN_LIBRARIES.join(', ')}. Pass a LibraryAdaptation object to describe your own.`,
  )
}

/** Drops `autoPrefix`, which is a registry concern and not part of the model. */
function withoutRegistryFields(entry: RegistryEntry): LibraryAdaptation {
  const { autoPrefix: _autoPrefix, ...library } = entry
  return library
}

/**
 * Resolves one entry: a built-in name, a definition extending a built-in, or a
 * standalone definition.
 */
export function resolveLibrary(entry: LibraryEntry): LibraryAdaptation {
  if (typeof entry === 'string') {
    const found = REGISTRY[entry]
    if (!found) throw unknownLibrary(entry)
    return withoutRegistryFields(found)
  }

  if (entry.extends) {
    const base = REGISTRY[entry.extends]
    if (!base) throw unknownLibrary(entry.extends)
    const { extends: _extends, ...overrides } = entry
    // `name` defaults to the base so diagnostics and the derived profile keep
    // referring to the library the reader recognises.
    return { ...withoutRegistryFields(base), name: base.name, ...overrides }
  }

  if (!entry.name) {
    throw new Error(
      '[postcss-adaptive-matrix] A library needs a name, or an "extends" naming a built-in to inherit one.',
    )
  }
  return entry as LibraryAdaptation
}

/**
 * Every built-in, as automatic mode uses them.
 *
 * Libraries whose prefix is too generic keep only their path match here; see
 * `autoPrefix`.
 */
export function autoLibraries(): LibraryAdaptation[] {
  return BUILT_IN_LIBRARIES.map((name) => {
    const entry = REGISTRY[name]!
    const library = withoutRegistryFields(entry)
    if (entry.autoPrefix === false) delete library.prefix
    return library
  })
}

/** Normalises the `libraries` option, including its `'auto'` and `false` forms. */
export function resolveLibraries(
  input: AdaptiveMatrixOptions['libraries'],
): LibraryAdaptation[] {
  if (input === false) return []
  if (input === undefined || input === 'auto') return autoLibraries()
  return input.map(resolveLibrary)
}

/**
 * Marks a profile as synthesised rather than authored.
 *
 * The colon is deliberate: it cannot appear in an `@adaptive` name, so a
 * library canvas can never collide with one a user writes.
 */
export const LIBRARY_PROFILE_PREFIX = 'library:'

/** Name of the profile synthesised for a library's own canvas. */
export function libraryProfileName(library: LibraryAdaptation): string {
  return `${LIBRARY_PROFILE_PREFIX}${library.name}`
}

export interface LibraryExpansion {
  profiles: Record<string, AdaptiveProfile>
  routes: AdaptiveRoute[]
}

/**
 * Turns library definitions into the profiles and routes that implement them.
 *
 * A scaled library gets a profile cloned from `basedOn` with only the canvas
 * replaced, so it inherits the project's fluid range, unit and strategy and
 * therefore stops growing at the same viewport the rest of the page does. It is
 * given `query: false` because it describes a canvas, not a breakpoint, and must
 * never emit a media wrapper of its own.
 */
export function expandLibraries(
  libraries: LibraryAdaptation[],
  profiles: Record<string, AdaptiveProfile>,
  defaultProfile: string,
): LibraryExpansion {
  const derived: Record<string, AdaptiveProfile> = {}
  // Scoped routes are collected apart so they can be tested first: demanding a
  // path as well as a class is the more specific claim, and two libraries can
  // share a prefix while disagreeing about the canvas behind it.
  const scoped: AdaptiveRoute[] = []
  const routes: AdaptiveRoute[] = []

  for (const library of libraries) {
    const selector = toArray(library.prefix).map(prefixPattern)
    const property = toArray(library.tokenPrefix)
    const file = toArray(library.file)

    if (!selector.length && !property.length && !file.length) {
      throw new Error(
        `[postcss-adaptive-matrix] Library "${library.name}" matches nothing. Give it a prefix, tokenPrefix or file.`,
      )
    }

    let profile: string | false = false
    if (library.designWidth !== false) {
      const baseName = library.basedOn ?? defaultProfile
      const base = profiles[baseName]
      if (!base) {
        throw new Error(
          `[postcss-adaptive-matrix] Library "${library.name}" is based on unknown profile "${baseName}".`,
        )
      }
      if (!Number.isFinite(library.designWidth) || library.designWidth <= 0) {
        throw new RangeError(
          `[postcss-adaptive-matrix] Library "${library.name}" requires a positive designWidth, or false to leave it unconverted.`,
        )
      }
      profile = libraryProfileName(library)
      // `rootMaxWidth` is dropped rather than inherited: it describes the page
      // layout at a breakpoint, and a library canvas is neither. Keeping it
      // would emit one duplicate root cap per library into the foundation.
      const { rootMaxWidth: _rootMaxWidth, ...canvas } = base
      derived[profile] = { ...canvas, designWidth: library.designWidth, query: false }
    }

    // Separate routes per axis: a route requires every axis it declares to
    // match, and a library matching by class must not also demand a file path
    // — unless it says otherwise, because its prefix alone is not conclusive.
    if (library.scoped) {
      if (!file.length) {
        throw new Error(
          `[postcss-adaptive-matrix] Library "${library.name}" is scoped but names no file to scope it to.`,
        )
      }
      if (selector.length) scoped.push({ profile, selector, file })
      if (property.length) scoped.push({ profile, property, file })
      scoped.push({ profile, file })
    } else {
      if (selector.length) routes.push({ profile, selector })
      if (property.length) routes.push({ profile, property })
      if (file.length) routes.push({ profile, file })
    }
  }

  return { profiles: derived, routes: [...scoped, ...routes] }
}

/** Convenience for configs: `libraries: [...]` without repeating the type. */
export function defineLibraries(
  libraries: NonNullable<AdaptiveMatrixOptions['libraries']>,
): LibraryAdaptation[] {
  return resolveLibraries(libraries)
}
