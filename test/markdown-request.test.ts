import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMarkdown } from '../docs/.vitepress/theme/markdown-request.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Markdown requests', () => {
  it('returns raw Markdown and clears the deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# Guide')))
    expect(await readMarkdown('/guide.md', new AbortController().signal)).toBe('# Guide')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    new Response('missing', { status: 404 }),
    new Response('<html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  ])('rejects errors and static-host HTML fallbacks', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(readMarkdown('/guide.md', new AbortController().signal)).rejects.toThrow()
  })

  it('times out even when fetch ignores cancellation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const pending = readMarkdown('/guide.md', new AbortController().signal)
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an unfinished response body and clears its deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        text: () => new Promise(() => {}),
      }),
    )
    const controller = new AbortController()
    const pending = readMarkdown('/guide.md', controller.signal)
    const rejection = expect(pending).rejects.toThrow('cancelled')
    await Promise.resolve()
    controller.abort()
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not fetch with an already cancelled caller', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    controller.abort()
    await expect(readMarkdown('/guide.md', controller.signal)).rejects.toThrow('cancelled')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
