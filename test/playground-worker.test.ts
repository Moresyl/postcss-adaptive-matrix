import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { SAMPLES } from '../docs/.vitepress/theme/playground-samples'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function compile(css: string, options: string) {
  vi.resetModules()
  const postMessage = vi.fn()
  const scope = { postMessage, onmessage: undefined as unknown as (event: unknown) => void }
  vi.stubGlobal('self', scope)
  await import('../docs/.vitepress/theme/compiler.worker')
  scope.onmessage({ data: { css, options } })
  expect(postMessage).toHaveBeenCalledOnce()
  return postMessage.mock.calls[0]![0]
}

describe('playground compiler worker', () => {
  it.each(['playground.md', 'playground.zh-CN.md'])(
    'compiles the preset expression documented in %s',
    async (page) => {
      const markdown = readFileSync(new URL(`../docs/${page}`, import.meta.url), 'utf8')
      const expression = /`(appPcPreset\([^`]+\))`/.exec(markdown)?.[1]
      expect(expression).toBeDefined()
      const result = await compile('.card { padding: 24px }', expression!)
      expect(result.error).toBeUndefined()
      expect(result.css).toContain('6.4vw')
    },
  )

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
    if (sample.label === 'Static text') {
      expect(result.css).toContain('font-size: calc(2rem)')
      expect(result.css).toContain('line-height: calc(2.75rem)')
      expect(result.css).toContain('margin-bottom: calc(4.26667vw)')
      expect(result.css).not.toContain('clamp(')
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

  it.each(['null', '42', '"options"', '[]', 'new Date(0)', 'Promise.resolve({})', '() => ({})'])(
    'rejects a non-configuration expression result: %s',
    async (options) => {
      const result = await compile('.card { padding: 24px }', options)
      expect(result.error).toMatch(/Options must be an object/)
      expect(result.css).toBeUndefined()
      expect(result.duration).toBeUndefined()
      expect(structuredClone(result)).toEqual(result)
    },
  )

  it('keeps an omitted options result equivalent to zero configuration', async () => {
    const source = '.card { padding: 24px }'
    const omitted = await compile(source, 'undefined')
    const empty = await compile(source, '{}')
    expect(omitted.error).toBeUndefined()
    expect(omitted.css).toBe(empty.css)
    expect(omitted.warnings).toEqual(empty.warnings)
  })
})
