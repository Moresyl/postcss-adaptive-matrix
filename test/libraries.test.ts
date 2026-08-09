import { describe, expect, it } from 'vitest'
import {
  autoLibraries,
  BUILT_IN_LIBRARIES,
  expandLibraries,
  libraryProfileName,
  resolveLibrary,
} from '../src/core/libraries.js'
import { resolveOptions } from '../src/core/options.js'
import { createProfileResolver } from '../src/core/resolve.js'
import type { AdaptiveProfile, LibraryEntry } from '../src/core/types.js'

const PROFILES: Record<string, AdaptiveProfile> = {
  app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 }, unit: 'vw' },
}

describe('resolveLibrary', () => {
  it('looks up a built-in by name', () => {
    expect(resolveLibrary('vant').designWidth).toBe(375)
  })

  it('passes a custom definition through untouched', () => {
    const custom = { name: 'internal-kit', designWidth: 414, prefix: 'ik-' }
    expect(resolveLibrary(custom)).toBe(custom)
  })

  it('names the built-ins when given something unknown', () => {
    expect(() => resolveLibrary('vant-4')).toThrow(/Built-in libraries: .*vant/)
  })

  it('exposes the registry so tooling can list it', () => {
    expect(BUILT_IN_LIBRARIES).toContain('vant')
    expect(BUILT_IN_LIBRARIES).toContain('element-plus')
  })
})

describe('automatic mode', () => {
  it('is the default, so a project needs no configuration', () => {
    const options = resolveOptions({ profiles: PROFILES, defaultProfile: 'app' })
    expect(options.libraries.map((library) => library.name)).toEqual([
      ...BUILT_IN_LIBRARIES,
    ])
  })

  it('can be turned off entirely', () => {
    const options = resolveOptions({
      profiles: PROFILES,
      defaultProfile: 'app',
      libraries: false,
    })
    expect(options.libraries).toHaveLength(0)
    expect(options.routes).toHaveLength(0)
  })

  it('withholds a prefix that is too generic to trust unattended', () => {
    const auto = autoLibraries()
    expect(auto.find((library) => library.name === 'naive-ui')?.prefix).toBeUndefined()
    expect(auto.find((library) => library.name === 'quasar')?.prefix).toBeUndefined()
    expect(auto.find((library) => library.name === 'taro-ui')?.prefix).toBeUndefined()
  })

  it('still finds those libraries by path', () => {
    const auto = autoLibraries()
    expect(auto.find((library) => library.name === 'naive-ui')?.file).toBeDefined()
  })

  it('keeps distinctive prefixes active', () => {
    const auto = autoLibraries()
    expect(auto.find((library) => library.name === 'vant')?.prefix).toBe('van-')
    expect(auto.find((library) => library.name === 'element-plus')?.prefix).toBe('el-')
  })

  it('restores the prefix once a library is named explicitly', () => {
    expect(resolveLibrary('naive-ui').prefix).toBe('n-')
  })

  it('never exposes the registry-only autoPrefix field', () => {
    expect('autoPrefix' in resolveLibrary('naive-ui')).toBe(false)
  })
})

/**
 * Properties every entry must hold, checked against the whole registry rather
 * than a handful of named libraries.
 *
 * A bad entry here is the worst kind of bug this project can ship: it is silent,
 * it fires on projects that configured nothing, and it misconverts somebody
 * else's component library. The cases above pin down the entries that exist
 * today; these pin down the ones nobody has written yet.
 */
describe('registry invariants', () => {
  const all = BUILT_IN_LIBRARIES.map((name) => resolveLibrary(name))

  it('lists libraries sorted and without duplicates', () => {
    expect([...BUILT_IN_LIBRARIES]).toEqual([...BUILT_IN_LIBRARIES].sort())
    expect(new Set(BUILT_IN_LIBRARIES).size).toBe(BUILT_IN_LIBRARIES.length)
  })

  it('names each entry after the key it is looked up by', () => {
    for (const [index, library] of all.entries()) {
      expect(library.name).toBe(BUILT_IN_LIBRARIES[index])
    }
  })

  it('gives every entry a path match', () => {
    // The path channel is the only one that works unattended for every library:
    // prefixes can be withheld as too generic, and desktop kits ship no tokens.
    for (const library of all) {
      expect(library.file, library.name).toBeDefined()
      const matchers = Array.isArray(library.file) ? library.file : [library.file]
      expect(matchers.length, library.name).toBeGreaterThan(0)
    }
  })

  it('declares a canvas that is either a real width or an explicit opt-out', () => {
    for (const library of all) {
      if (library.designWidth === false) continue
      expect(typeof library.designWidth, library.name).toBe('number')
      expect(library.designWidth as number, library.name).toBeGreaterThan(0)
      expect(Number.isFinite(library.designWidth as number), library.name).toBe(true)
    }
  })

  it('keeps class prefixes unambiguous across libraries', () => {
    // Nested prefixes would make routing depend on registry order: `.ant-` and
    // `.ant-mobile-` would both match the same selector, and the winner would be
    // whichever happened to be declared first.
    const prefixes = all.map((library) => library.prefix).filter(Boolean) as string[]
    expect(new Set(prefixes).size).toBe(prefixes.length)
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b) expect(b.startsWith(a), `${b} starts with ${a}`).toBe(false)
      }
    }
  })

  it('keeps token prefixes unambiguous across libraries', () => {
    const tokens = all.map((library) => library.tokenPrefix).filter(Boolean) as string[]
    expect(new Set(tokens).size).toBe(tokens.length)
    for (const a of tokens) {
      for (const b of tokens) {
        if (a !== b) expect(b.startsWith(a), `${b} starts with ${a}`).toBe(false)
      }
    }
  })

  it('never enables a prefix short enough to collide with application code', () => {
    // Three characters is the line: `el-` and `at-` are recognisably a library,
    // `n-` and `q-` are what anyone might name a utility class. Anything shorter
    // has to be asked for by name, which is what autoPrefix: false expresses.
    for (const library of autoLibraries()) {
      if (library.prefix === undefined) continue
      expect(library.prefix.length, library.name).toBeGreaterThanOrEqual(3)
    }
  })

  it('offers every library in automatic mode, prefix or not', () => {
    expect(autoLibraries().map((library) => library.name)).toEqual([...BUILT_IN_LIBRARIES])
  })

  it('gives each library a profile name that cannot collide with an authored one', () => {
    // `@adaptive` names are identifiers; the colon makes the synthesised name
    // unspellable, so no user profile can shadow a library canvas.
    const names = all.map((library) => libraryProfileName(library))
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toContain(':')
  })
})

describe('extends', () => {
  it('corrects one field and inherits the rest', () => {
    const library = resolveLibrary({ extends: 'vant', designWidth: 750 })
    expect(library.name).toBe('vant')
    expect(library.designWidth).toBe(750)
    expect(library.prefix).toBe('van-')
    expect(library.tokenPrefix).toBe('--van-')
  })

  it('can stop a scaled library from scaling', () => {
    expect(resolveLibrary({ extends: 'vant', designWidth: false }).designWidth).toBe(false)
  })

  it('reports an unknown base', () => {
    expect(() => resolveLibrary({ extends: 'vant-next' })).toThrow(/Unknown library/)
  })

  // TypeScript already rejects this shape; the cast is what a JavaScript config
  // would hand us, and the runtime message is all such a project ever sees.
  it('requires a name when there is nothing to inherit one from', () => {
    expect(() =>
      resolveLibrary({ designWidth: 375, prefix: 'x-' } as unknown as LibraryEntry),
    ).toThrow(/needs a name/)
  })
})

describe('expandLibraries', () => {
  it('does not let a library canvas contribute root layout', () => {
    const { profiles } = expandLibraries(
      [resolveLibrary('vant')],
      { app: { ...PROFILES.app!, rootMaxWidth: 600 } },
      'app',
    )
    expect(profiles['library:vant']!.rootMaxWidth).toBeUndefined()
  })

  it('borrows the base fluid range but replaces the canvas', () => {
    const { profiles } = expandLibraries([resolveLibrary('vant')], PROFILES, 'app')
    const derived = profiles['library:vant']!
    expect(derived.designWidth).toBe(375)
    expect(derived.fluid).toEqual(PROFILES.app!.fluid)
    expect(derived.unit).toBe('vw')
  })

  it('never lets a library canvas emit a media wrapper', () => {
    const { profiles } = expandLibraries([resolveLibrary('vant')], PROFILES, 'app')
    expect(profiles[libraryProfileName(resolveLibrary('vant'))]!.query).toBe(false)
  })

  it('creates no profile for a library that should stay in pixels', () => {
    const { profiles, routes } = expandLibraries(
      [resolveLibrary('element-plus')],
      PROFILES,
      'app',
    )
    expect(Object.keys(profiles)).toHaveLength(0)
    expect(routes.every((route) => route.profile === false)).toBe(true)
  })

  it('rejects a library that matches nothing', () => {
    expect(() =>
      expandLibraries([{ name: 'ghost', designWidth: 375 }], PROFILES, 'app'),
    ).toThrow(/matches nothing/)
  })

  it('rejects a library based on a profile that does not exist', () => {
    expect(() =>
      expandLibraries(
        [{ name: 'kit', designWidth: 375, prefix: 'k-', basedOn: 'tablet' }],
        PROFILES,
        'app',
      ),
    ).toThrow(/unknown profile "tablet"/)
  })

  it('keeps the axes independent so a class match needs no file match', () => {
    const { routes } = expandLibraries([resolveLibrary('vant')], PROFILES, 'app')
    const selectorRoute = routes.find((route) => route.selector)
    expect(selectorRoute?.file).toBeUndefined()
  })
})

describe('library routing', () => {
  const options = resolveOptions({
    profiles: PROFILES,
    defaultProfile: 'app',
    libraries: ['vant', 'element-plus'],
  })
  const resolver = createProfileResolver(options)
  const base = resolver.forFile('/src/app.css')

  it('sends library classes to the library canvas', () => {
    expect(resolver.forSelector(base, '.van-button', '/src/app.css').name).toBe(
      'library:vant',
    )
  })

  it('matches a library class nested inside a longer selector', () => {
    expect(
      resolver.forSelector(base, '.page .van-cell__title', '/src/app.css').name,
    ).toBe('library:vant')
  })

  it('requires a real class boundary', () => {
    expect(resolver.forSelector(base, '.caravan-slot', '/src/app.css').name).toBe('app')
  })

  it('stops converting a library authored in real pixels', () => {
    expect(resolver.forSelector(base, '.el-button', '/src/app.css').convert).toBe(false)
  })

  it('routes theme tokens by name, since :root carries no class', () => {
    expect(resolver.forCustomProperty(base, '--van-padding-md', '/src/app.css')?.name).toBe(
      'library:vant',
    )
  })

  it('leaves application variables unclaimed', () => {
    expect(resolver.forCustomProperty(base, '--brand-gap', '/src/app.css')).toBeUndefined()
  })

  it('lets an authored route override a library', () => {
    const overridden = resolveOptions({
      profiles: PROFILES,
      defaultProfile: 'app',
      routes: [{ profile: false, selector: [/\.van-icon/] }],
      libraries: ['vant'],
    })
    const custom = createProfileResolver(overridden)
    const start = custom.forFile('/src/app.css')
    expect(custom.forSelector(start, '.van-icon', '/src/app.css').convert).toBe(false)
    expect(custom.forSelector(start, '.van-button', '/src/app.css').name).toBe(
      'library:vant',
    )
  })

  it('still defers to an explicit @adaptive block', () => {
    const explicit = { name: 'app', profile: PROFILES.app!, explicit: true, convert: true }
    expect(resolver.forSelector(explicit, '.van-button', '/src/app.css').name).toBe('app')
    expect(resolver.forCustomProperty(explicit, '--van-padding-md', '/src/app.css')).toBeUndefined()
  })
})
