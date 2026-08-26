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

  it('does not promote escaped class punctuation into a route selector', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ':hover' }])
    const inherited = resolver.forFile('/src/bundle.css')

    expect(resolver.forSelector(inherited, String.raw`.foo\3a hover`, '/src/bundle.css').name).toBe(
      'app',
    )
    expect(resolver.forSelector(inherited, '.foo:hover', '/src/bundle.css').name).toBe('vendor')
  })

  it('requires both to match when a route names a file and a selector', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'], file: /bundle/ }])
    const inherited = resolver.forFile('/src/page.css')
    expect(resolver.forSelector(inherited, '.vd-button', '/src/page.css').name).toBe('app')
    expect(resolver.forSelector(inherited, '.vd-button', '/src/bundle.css').name).toBe('vendor')
  })

  it('keeps authored attribute routes separate from class routes', () => {
    const resolver = resolverFor([
      { profile: 'vendor', selector: '[data-icon=".vd-cell"]' },
      { profile: false, selector: '.vd-' },
    ])
    const inherited = resolver.forFile('/src/page.css')

    expect(resolver.forSelector(inherited, '[data-icon=".vd-cell"]', '/src/page.css').name).toBe(
      'vendor',
    )
  })

  it('never overrides a profile the author named explicitly', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'] }])
    const resolvedBase = resolveOptions({ ...base, libraries: false })
    const explicit = {
      name: 'app',
      profile: resolvedBase.profiles.app!,
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

  it('reuses the immutable result of a matching route', () => {
    const resolver = resolverFor([{ profile: 'vendor', selector: ['.vd-'] }])
    const inherited = resolver.forFile('/src/a.css')
    const first = resolver.forSelector(inherited, '.vd-button', '/src/a.css')
    const second = resolver.forSelector(inherited, '.vd-card', '/src/a.css')

    expect(first).toBe(second)
  })

  it('rejects a route pointing at a profile that does not exist', () => {
    expect(() => resolverFor([{ profile: 'ghost', file: /x/ }])).toThrow('unknown profile "ghost"')
  })

  it('matches custom-property prefixes case-sensitively, as CSS does', () => {
    const resolver = resolverFor([{ profile: 'vendor', property: '--Theme-' }])
    const active = resolver.forFile('/src/app.css')

    expect(resolver.forCustomProperty(active, '--Theme-gap', '/src/app.css')?.name).toBe('vendor')
    expect(resolver.forCustomProperty(active, '--theme-gap', '/src/app.css')).toBeUndefined()
    expect(
      resolver.forCustomProperty(active, String.raw`--\54 heme-gap`, '/src/app.css')?.name,
    ).toBe('vendor')
  })
})
