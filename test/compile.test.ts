import { describe, expect, it } from 'vitest'
import { compileAdaptiveCss, createAdaptiveCompiler } from '../src/index.js'

describe('programmatic compiler', () => {
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
