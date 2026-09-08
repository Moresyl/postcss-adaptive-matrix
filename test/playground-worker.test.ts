import { afterEach, describe, expect, it, vi } from 'vitest'

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
