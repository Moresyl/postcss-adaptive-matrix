import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLES } from '../docs/.vitepress/theme/playground-samples'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function compile(css: string, options: string) {
  const postMessage = vi.fn()
  const scope = { postMessage, onmessage: undefined as unknown as (event: unknown) => void }
  vi.stubGlobal('self', scope)
  await import('../docs/.vitepress/theme/compiler.worker')
  scope.onmessage({ data: { css, options } })
  expect(postMessage).toHaveBeenCalledOnce()
  return postMessage.mock.calls[0]![0]
}

describe('playground compiler worker', () => {
  it.each(SAMPLES)('compiles the actual $label page sample', async (sample) => {
    const result = await compile(sample.css, sample.options)
    expect(result.error).toBeUndefined()
    expect(result.css).toBeTypeOf('string')
    expect(result.duration).toBeGreaterThanOrEqual(0)
    if (sample.label === 'A warning worth having') {
      expect(result.warnings.length).toBeGreaterThan(0)
    } else {
      expect(result.warnings).toEqual([])
    }
    if (sample.label === 'App + desktop') {
      expect(result.css).toContain('3.33333vw')
      expect(result.css).toContain('min-width: 768px')
    }
  })

  it('compiles optional-bound configuration into serializable results', async () => {
    const result = await compile('.card { padding: 24px }', '{ profiles: { app: 375 } }')
    expect(result.css).toContain('6.4vw')
    expect(result.error).toBeUndefined()
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(structuredClone(result)).toEqual(result)
  })

  it('makes public configuration helpers available', async () => {
    const result = await compile('.card { padding: 24px }', 'defineConfig()')
    expect(result.css).toBeTypeOf('string')
    expect(result.error).toBeUndefined()
  })

  it.each(['{', '(() => { throw new Error("invalid expression") })()'])(
    'reports expression failures without throwing across the worker boundary: %s',
    async (options) => {
      const result = await compile('.card { padding: 24px }', options)
      expect(result.error).toBeTypeOf('string')
      expect(result.css).toBeUndefined()
    },
  )

  it('reports CSS syntax failures', async () => {
    const result = await compile('.card {', '{}')
    expect(result.error).toContain('Unclosed block')
  })
})
