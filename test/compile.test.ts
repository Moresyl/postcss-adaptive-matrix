import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { compileAdaptiveCss, createAdaptiveCompiler, findContinuityIssues } from '../src/index.js'

describe('programmatic compiler', () => {
  it.each(['parser', 'stringifier'] as const)(
    'recovers after a custom %s throws',
    async (phase) => {
      const compile = createAdaptiveCompiler({
        profiles: { app: 400 },
        strategy: 'viewport',
        libraries: false,
      })
      const source = '.a { width: 40px }'
      const process = {
        [phase]: () => {
          throw new Error(`Custom ${phase} failed`)
        },
      }
      await expect(compile(source, { process })).rejects.toThrow(`Custom ${phase} failed`)
      const recovered = await compile(source, { failOn: ['warnings'] })
      expect(recovered.css).toBe('.a { width: 10vw }')
      expect(recovered.warnings).toEqual([])
      expect(recovered.gate?.passed).toBe(true)
      expect(recovered.map).toBeUndefined()
    },
  )

  it('isolates an in-flight compiler from a replacement created with edited configuration', async () => {
    const config = {
      profiles: { app: { designWidth: 400, fluid: { maxWidth: 600 } } },
      libraries: false as const,
    }
    const oldCompiler = createAdaptiveCompiler(config)
    const oldRequest = oldCompiler('.a { width: 40px }')
    config.profiles.app.designWidth = 800
    config.profiles.app.fluid.maxWidth = 1200
    const newCompiler = createAdaptiveCompiler(config)
    const [oldResult, newResult] = await Promise.all([
      oldRequest,
      newCompiler('.a { width: 40px }'),
    ])
    expect(oldResult.css).toContain('min(10vw, 60px)')
    expect(newResult.css).toContain('min(5vw, 60px)')
    expect((await oldCompiler('.a { width: 40px }')).css).toBe(oldResult.css)
    expect((await newCompiler('.a { width: 40px }')).css).toBe(newResult.css)
  })

  it.each(['media', 'container'] as const)(
    'captures %s query settings while keeping dynamic rulers live',
    async (type) => {
      let width = 400
      const query = { type, condition: '(min-width: 800px)' }
      const compile = createAdaptiveCompiler({
        profiles: { app: { designWidth: () => width, query } },
        strategy: 'viewport',
        libraries: false,
      })
      query.condition = '(min-width: 1600px)'
      const first = await compile('@adaptive app { .a { width: 40px } }')
      width = 800
      const second = await compile('@adaptive app { .a { width: 40px } }')
      expect(first.css).toContain(`@${type} (min-width: 800px)`)
      expect(second.css).toContain(`@${type} (min-width: 800px)`)
      expect(first.css).toContain('width: 10vw')
      expect(second.css).toContain('width: 5vw')
    },
  )

  it('captures root injection file filters before the first compilation', async () => {
    const injectTo = ['entry.css']
    const compile = createAdaptiveCompiler({ root: { injectTo }, libraries: false })
    injectTo[0] = 'other.css'
    const entry = await compile('.a { width: 24px }', { process: { from: '/src/entry.css' } })
    const other = await compile('.a { width: 24px }', { process: { from: '/src/other.css' } })
    expect(entry.css).toContain('postcss-adaptive-matrix foundation')
    expect(other.css).not.toContain('postcss-adaptive-matrix foundation')
  })

  it('captures media route bands before the first compilation', async () => {
    const band = { minWidth: 800 }
    const compile = createAdaptiveCompiler({
      profiles: { app: 375, desktop: 1200 },
      routes: { media: band, profile: 'desktop' },
      strategy: 'viewport',
      libraries: false,
    })
    band.minWidth = 1600
    const result = await compile('@media (min-width: 1000px) { .a { width: 120px } }')
    expect(result.css).toContain('width: 10vw')
  })

  it('captures nested profile and route settings when the compiler is created', async () => {
    const profile = { designWidth: 375, fluid: { maxWidth: 600 } }
    const route = { selector: ['.fixed'], profile: false as const }
    const compile = createAdaptiveCompiler({
      profiles: { app: profile },
      routes: [route],
      libraries: false,
    })
    const css = '.a { width: 24px } .fixed { width: 24px }'
    const before = await compile(css)
    profile.designWidth = 750
    profile.fluid.maxWidth = 900
    route.selector[0] = '.a'
    expect((await compile(css)).css).toBe(before.css)
  })

  it.each([
    { css: '.a { /* adaptive-ignore-next */ width: 1e308px }', options: {} },
    { css: '.a { width: 1e308px }', options: { propList: 'height' } },
    { css: '.a { width: 1e308px }', options: { selectorExclude: '.a' } },
    { css: '.a { width: 1e308px }', options: { valueExclude: '1e308px' } },
    {
      css: '.a { width: 1e308px }',
      options: { routes: { selector: '.a', profile: false as const } },
    },
    { css: ':root { --custom-width: 1e308px }', options: {} },
    { css: '.a { width: min(1e308px, 50vw) }', options: {} },
  ])(
    'does not warn about overflow in deliberately unconverted CSS: $css',
    async ({ css, options }) => {
      const result = await compileAdaptiveCss(
        css,
        { libraries: false, ...options },
        { failOn: ['warnings'] },
      )
      expect(result.css).toBe(css)
      expect(result.warnings).toEqual([])
      expect(result.gate?.passed).toBe(true)
    },
  )

  it('gates overflowing dimensions with located warnings, including cached conversions', async () => {
    const compile = createAdaptiveCompiler({ profiles: { app: 375 }, strategy: 'viewport' })
    for (const from of ['first.css', 'second.css']) {
      const result = await compile('.a { margin: 1e308px 1e309px 24px }', {
        process: { from },
        failOn: ['warnings'],
      })
      expect(result.css).toContain('1e308px 1e309px 6.4vw')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.text).toContain('finite numeric range')
      expect(result.warnings[0]?.line).toBe(1)
      expect(result.warnings[0]?.node?.source?.input.file).toContain(from)
      expect(result.gate?.passed).toBe(false)
    }
    const clean = await compile('.a { width: 24px }', { failOn: ['warnings'] })
    expect(clean.warnings).toEqual([])
    expect(clean.gate?.passed).toBe(true)
  })

  it('isolates mixed concurrent requests, failures, maps and file-specific rulers', async () => {
    const options = {
      profiles: {
        app: { designWidth: ({ file }: { file: string }) => (file.includes('wide') ? 750 : 375) },
      },
      rootValue: ({ file }: { file: string }) => (file.includes('legacy') ? 10 : 16),
      unitToConvert: ['px', 'rem'],
    }
    const compile = createAdaptiveCompiler(options)
    const inputs = Array.from({ length: 32 }, (_, index) => {
      const css =
        index % 7 === 0
          ? '.broken {'
          : index % 3 === 0
            ? '@adaptive missing { .card { padding: 24px } }'
            : '.card { padding: 2rem; font-size: 24px }'
      const request = {
        process: {
          from: `/src/${index % 2 ? 'wide' : 'mobile'}-${index % 4 ? 'modern' : 'legacy'}-${index}.css`,
          to: `/dist/${index}.css`,
          map: { inline: false, annotation: false },
        },
        targets: { safari: index % 2 ? 12 : 17 },
        failOn: ['warnings', 'compatibility'] as const,
      }
      return { css, request }
    })
    const shared = await Promise.allSettled(inputs.map(({ css, request }) => compile(css, request)))
    for (const [index, input] of inputs.entries()) {
      const result = shared[index]!
      if (input.css === '.broken {') {
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') expect(String(result.reason)).toContain('Unclosed block')
        continue
      }
      expect(result.status).toBe('fulfilled')
      if (result.status !== 'fulfilled') throw result.reason
      const independent = await compileAdaptiveCss(input.css, options, input.request)
      expect(result.value.css).toBe(independent.css)
      expect(result.value.map?.toJSON()).toEqual(independent.map?.toJSON())
      expect(result.value.map?.toJSON().sourcesContent).toEqual([input.css])
      expect(result.value.warnings.map((warning) => warning.toString())).toEqual(
        independent.warnings.map((warning) => warning.toString()),
      )
      expect(result.value.compatibility).toEqual(independent.compatibility)
      expect(result.value.gate).toEqual(independent.gate)
    }
    const recovered = await compile('.card { padding: 24px }', {
      process: { from: '/src/mobile-modern.css' },
      failOn: ['warnings'],
    })
    expect(recovered.css).toContain('6.4vw')
    expect(recovered.gate?.passed).toBe(true)
    expect(recovered.map).toBeUndefined()
    expect(recovered.compatibility).toBeNull()
  })

  it('reuses frozen file and selector regex routes across compilations', async () => {
    const file = Object.freeze(/desktop/g)
    const selector = Object.freeze(/\.card/g)
    const compile = createAdaptiveCompiler({
      defaultProfile: 'app',
      profiles: { app: 375, pc: 750 },
      routes: [{ file, selector, profile: 'pc' }],
    })
    for (let index = 0; index < 2; index++) {
      const output = await compile('.card { padding: 24px }', {
        process: { from: '/src/desktop.css' },
      })
      expect(output.css).toContain('3.2vw')
    }
    const mobile = await compile('.card { padding: 24px }', {
      process: { from: '/src/mobile.css' },
    })
    expect(mobile.css).toContain('6.4vw')
    expect(file.lastIndex).toBe(0)
    expect(selector.lastIndex).toBe(0)
  })

  it('supports custom parsers returning independent source roots', async () => {
    const files: string[] = []
    const compile = createAdaptiveCompiler({
      profiles: {
        app: {
          designWidth: ({ file }) => {
            files.push(file)
            return file.includes('desktop') ? 750 : 375
          },
        },
      },
    })
    const output = await compile('', {
      process: {
        parser: () => {
          const document = postcss.document()
          document.append(postcss.parse('.a { width: 24px }', { from: '/src/mobile.css' }))
          document.append(postcss.parse('.a { width: 24px }', { from: '/src/desktop.css' }))
          return document
        },
      },
    })
    expect(output.result.root.type).toBe('document')
    expect(output.css).toContain('6.4vw')
    expect(output.css).toContain('3.2vw')
    expect(files).toHaveLength(2)
    expect(files[0]).toContain('mobile.css')
    expect(files[1]).toContain('desktop.css')
    expect(findContinuityIssues(output.result.root)).toEqual([])
    expect(output.warnings).toEqual([])
  })

  it('composes with continuity analysis using the same nondefault rem ruler', async () => {
    const rootValue = 20
    const output = await compileAdaptiveCss(
      '.card { font-size: calc(2rem) } @media (min-width: 768px) { .card { font-size: calc(1rem) } }',
      { rootValue },
    )
    const root = output.result.root
    if (root.type !== 'root') throw new Error('Expected a single stylesheet root')
    const issues = findContinuityIssues(root, rootValue)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      selector: '.card',
      prop: 'font-size',
      breakpoint: 768,
      below: { px: 40 },
      above: { px: 20 },
    })
  })

  it('snapshots source-map settings before yielding', async () => {
    const map = { inline: false, annotation: false, sourcesContent: true }
    const pending = compileAdaptiveCss(
      '.a { padding: 24px }',
      {},
      {
        process: { from: '/src/a.css', to: '/dist/a.css', map },
      },
    )
    map.inline = true
    map.sourcesContent = false
    const output = await pending
    expect(output.map).toBeDefined()
    expect(output.map?.toJSON().sourcesContent).toEqual(['.a { padding: 24px }'])
    expect(output.css).not.toContain('sourceMappingURL')
  })

  it('works without optional parameters and retains the PostCSS result', async () => {
    const output = await compileAdaptiveCss('.card { padding: 24px }')
    expect(output.css).toContain('6.4vw')
    expect(output.result.css).toBe(output.css)
    expect(output.compatibility).toBeNull()
    expect(output.gate).toBeNull()
    expect(output.warnings).toEqual([])
  })

  it('emits source maps with authored sources', async () => {
    const output = await compileAdaptiveCss(
      '.card { padding: 24px }',
      {},
      {
        process: {
          from: '/src/card.css',
          to: '/dist/card.css',
          map: { inline: false, annotation: false },
        },
      },
    )
    expect(output.map?.toJSON().sourcesContent).toEqual(['.card { padding: 24px }'])
    expect(output.map?.toJSON().sources).toEqual(['../src/card.css'])
  })

  it.each([
    { label: 'disabled', map: false, expectsMap: false },
    { label: 'inline', map: { inline: true, annotation: true }, expectsMap: true },
  ])(
    'supports $label source-map mode without changing CSS semantics',
    async ({ map, expectsMap }) => {
      const output = await compileAdaptiveCss(
        '.card { padding: 24px }',
        {},
        {
          process: { from: 'card.css', map },
        },
      )
      // PostCSS embeds inline maps in CSS instead of returning a map object.
      expect(output.map).toBeUndefined()
      expect(output.css).toContain('6.4vw')
      if (expectsMap) expect(output.css).toContain('sourceMappingURL=data:')
    },
  )

  it('chains an upstream map back to the original source', async () => {
    const original = '.original { padding: 24px }'
    const prev = JSON.stringify({
      version: 3,
      file: 'intermediate.css',
      sources: ['original.scss'],
      sourcesContent: [original],
      names: [],
      mappings: 'AAAA',
    })
    const output = await compileAdaptiveCss(
      '.card { padding: 24px }',
      {},
      {
        process: {
          from: '/src/intermediate.css',
          to: '/dist/card.css',
          map: { prev, inline: false, annotation: false },
        },
      },
    )
    expect(output.map?.toJSON().sources).toEqual(['../src/original.scss'])
    expect(output.map?.toJSON().sourcesContent).toEqual([original])
    expect(output.map?.toJSON().mappings).not.toBe('')
  })

  it('audits generated features only when targets are supplied', async () => {
    const output = await compileAdaptiveCss(
      '.card { padding: 24px }',
      {},
      { targets: { safari: 12 } },
    )
    expect(output.compatibility?.findings.length).toBeGreaterThan(0)
  })

  it('refreshes dynamic rulers on repeated and concurrent calls', async () => {
    let width = 375
    const compile = createAdaptiveCompiler({ profiles: { app: { designWidth: () => width } } })
    const first = await compile('.card { padding: 24px }')
    width = 750
    const [second, third] = await Promise.all([
      compile('.card { padding: 24px }'),
      compile('.card { padding: 48px }'),
    ])
    expect(first.css).toContain('6.4vw')
    expect(second.css).toContain('3.2vw')
    expect(third.css).toContain('6.4vw')
  })

  it('propagates CSS syntax errors', async () => {
    await expect(compileAdaptiveCss('.broken {')).rejects.toThrow('Unclosed block')
  })

  it('recovers after syntax errors without leaking diagnostics into later requests', async () => {
    const compile = createAdaptiveCompiler()
    await expect(compile('.broken {')).rejects.toThrow('Unclosed block')
    const warning = await compile('@adaptive missing { .a { width: 24px } }', {
      failOn: ['warnings'],
    })
    expect(warning.gate?.passed).toBe(false)
    const clean = await compile('.a { padding: 24px }', { failOn: ['warnings'] })
    expect(clean.css).toContain('6.4vw')
    expect(clean.warnings).toEqual([])
    expect(clean.gate?.passed).toBe(true)
    expect(clean.result).not.toBe(warning.result)
  })

  it('refreshes dynamic rulers after a callback failure', async () => {
    let width = 375
    let failing = false
    const compile = createAdaptiveCompiler({
      profiles: {
        app: {
          designWidth: () => {
            if (failing) throw new Error('Design width unavailable')
            return width
          },
        },
      },
    })
    expect((await compile('.a { padding: 24px }')).css).toContain('6.4vw')
    failing = true
    await expect(compile('.a { padding: 24px }')).rejects.toThrow('Design width unavailable')
    failing = false
    width = 750
    expect((await compile('.a { padding: 24px }')).css).toContain('3.2vw')
  })

  it('snapshots browser targets before yielding to the caller', async () => {
    const targets = { safari: 12 }
    const pending = compileAdaptiveCss('.card { padding: 24px }', {}, { targets })
    targets.safari = 100
    const output = await pending
    expect(output.compatibility?.findings.length).toBeGreaterThan(0)
  })

  it('returns unknown targets explicitly instead of implying compatibility', async () => {
    const output = await compileAdaptiveCss('', {}, { targets: { unknownEngine: 1 } })
    expect(output.compatibility?.unknownBrowsers).toEqual(['unknownEngine'])
    expect(output.compatibility?.satisfied).toEqual([])
  })

  it('returns compiler warnings with source locations', async () => {
    const output = await compileAdaptiveCss(
      '@media (min-width: 1024px) { .card { width: 24px } }',
      { profiles: { app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } } } },
      { process: { from: 'warning.css' } },
    )
    expect(output.warnings.length).toBeGreaterThan(0)
    expect(output.warnings[0]?.line).toBe(1)
  })

  it('validates targets before invoking dynamic configuration callbacks', async () => {
    let calls = 0
    const compile = createAdaptiveCompiler({
      profiles: {
        app: {
          designWidth: () => {
            calls++
            return 375
          },
        },
      },
    })
    await expect(compile('.card { width: 24px }', { targets: {} })).rejects.toThrow()
    expect(calls).toBe(0)
  })

  it.each([
    null,
    [],
    { unknown: true },
    { process: null },
    { targets: {} },
    { targets: null },
    { targets: [] },
  ])('rejects invalid request options %j', async (request) => {
    await expect(compileAdaptiveCss('', {}, request as never)).rejects.toThrow()
  })

  it('rejects non-string CSS', async () => {
    await expect(compileAdaptiveCss(null as never)).rejects.toThrow('CSS input must be a string')
  })

  it('retains CSS when a compatibility gate fails', async () => {
    const output = await compileAdaptiveCss(
      '.a { padding: 24px }',
      {},
      {
        targets: { safari: 12 },
        failOn: ['compatibility'],
      },
    )
    expect(output.gate).toEqual({ failOn: ['compatibility'], passed: false })
    expect(output.css).toContain('6.4vw')
    expect(output.compatibility?.findings.length).toBeGreaterThan(0)
  })

  it('does not pass a compatibility gate for unknown targets', async () => {
    const output = await compileAdaptiveCss(
      '',
      {},
      {
        targets: { unknown: 1 },
        failOn: ['compatibility'],
      },
    )
    expect(output.gate?.passed).toBe(false)
  })

  it('passes when selected diagnostics are absent and deduplicates categories', async () => {
    const output = await compileAdaptiveCss(
      '',
      {},
      {
        targets: { chrome: 100 },
        failOn: ['warnings', 'compatibility', 'warnings'],
      },
    )
    expect(output.gate).toEqual({ failOn: ['warnings', 'compatibility'], passed: true })
  })

  it('fails the warning gate while retaining source diagnostics', async () => {
    const output = await compileAdaptiveCss(
      '@adaptive missing { .a { width: 24px } }',
      {},
      {
        failOn: ['warnings'],
      },
    )
    expect(output.gate?.passed).toBe(false)
    expect(output.warnings.length).toBeGreaterThan(0)
  })

  it('snapshots gate categories before yielding', async () => {
    const failOn: ('warnings' | 'compatibility')[] = ['compatibility']
    const pending = compileAdaptiveCss(
      '.a { padding: 24px }',
      {},
      {
        targets: { safari: 12 },
        failOn,
      },
    )
    failOn.splice(0)
    expect((await pending).gate?.passed).toBe(false)
  })

  it('treats an empty gate as omitted', async () => {
    expect((await compileAdaptiveCss('', {}, { failOn: [] })).gate).toBeNull()
  })

  it.each([null, 'warnings', ['continuity'], [1], new Array(1), ['compatibility']])(
    'rejects invalid gates before dynamic callbacks: %j',
    async (failOn) => {
      let calls = 0
      const compile = createAdaptiveCompiler({
        profiles: {
          app: {
            designWidth: () => {
              calls++
              return 375
            },
          },
        },
      })
      await expect(compile('.a { padding: 24px }', { failOn } as never)).rejects.toThrow()
      expect(calls).toBe(0)
    },
  )
})
