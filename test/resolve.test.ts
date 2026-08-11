import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/core/options.js'
import { createProfileResolver } from '../src/core/resolve.js'
import type { AdaptiveMatrixOptions } from '../src/core/types.js'

const base: AdaptiveMatrixOptions = {
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } },
    vendor: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 480 } },
  },
}

/** Libraries are off here so these assertions describe routing alone. */
function resolverFor(routes: AdaptiveMatrixOptions['routes']) {
  return createProfileResolver(resolveOptions({ ...base, routes, libraries: false }))
}

describe('profile resolution', () => {
  it('falls back to the default profile when nothing matches', () => {
    const resolver = resolverFor([])
    const active = resolver.forFile('/src/app.css')
    expect(active.name).toBe('app')
    expect(active.explicit).toBe(false)
    expect(resolver.hasSelectorRoutes).toBe(false)
  })

  it('routes by file path', () => {
    const resolver = resolverFor([{ profile: 'vendor', file: /vendor-ui/ }])
    expect(resolver.forFile('/node_modules/vendor-ui/a.css').name).toBe('vendor')
    expect(resolver.forFile('/src/a.css').name).toBe('app')
  })

  it('routes by selector even when the file gives no hint', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'] }])
    const inherited = resolver.forFile('/src/bundle.css')
    expect(inherited.name).toBe('app')
    expect(resolver.forSelector(inherited, '.vd-button', '/src/bundle.css').name).toBe('vendor')
    expect(resolver.forSelector(inherited, '.app-button', '/src/bundle.css').name).toBe('app')
  })

  it('requires both to match when a route names a file and a selector', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'], file: /bundle/ }])
    const inherited = resolver.forFile('/src/page.css')
    expect(resolver.forSelector(inherited, '.vd-button', '/src/page.css').name).toBe('app')
    expect(resolver.forSelector(inherited, '.vd-button', '/src/bundle.css').name).toBe('vendor')
  })

  it('never overrides a profile the author named explicitly', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'] }])
    const explicit = {
      name: 'app',
      profile: base.profiles!.app!,
      explicit: true,
      convert: true,
    }
    expect(resolver.forSelector(explicit, '.vd-button', '/src/a.css').name).toBe('app')
  })

  it('takes the first matching route', () => {
    const resolver = resolverFor([
      { profile: 'app', selector: ['.vd-special'] },
      { profile: 'vendor', selector: ['.vd-'] },
    ])
    const inherited = resolver.forFile('/src/a.css')
    expect(resolver.forSelector(inherited, '.vd-special', '/src/a.css').name).toBe('app')
    expect(resolver.forSelector(inherited, '.vd-other', '/src/a.css').name).toBe('vendor')
  })

  it('rejects a route pointing at a profile that does not exist', () => {
    expect(() => resolverFor([{ profile: 'ghost', file: /x/ }])).toThrow('unknown profile "ghost"')
  })
})
