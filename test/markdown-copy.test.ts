import { afterEach, expect, it, vi } from 'vitest'
import { createMarkdownCopy } from '../docs/.vitepress/theme/markdown-copy'
import { readMarkdown } from '../docs/.vitepress/theme/markdown-request.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('recovers from a real request deadline and copies the retry without altering Markdown', async () => {
  vi.useFakeTimers()
  const markdown = '# 中文\r\n\r\n```css\r\n.card { content: "\\263a"; }\r\n```\r\n'
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(new Promise(() => {}))
    .mockResolvedValueOnce(new Response(markdown))
  vi.stubGlobal('fetch', fetcher)
  const write = vi.fn(async () => {})
  const update = vi.fn()
  const task = createMarkdownCopy(readMarkdown, write, update)
  const pending = task.copy('/old.md')
  await vi.advanceTimersByTimeAsync(10_000)
  await pending
  expect(update).toHaveBeenLastCalledWith('failed')
  expect(write).not.toHaveBeenCalled()
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true)
  await task.copy('/new.md')
  expect(fetcher.mock.calls[1]![0]).toBe('/new.md')
  expect(write).toHaveBeenCalledExactlyOnceWith(markdown)
  expect(update).toHaveBeenLastCalledWith('copied')
  expect(vi.getTimerCount()).toBe(0)
})

it('releases a cancelled real download before copying the new page', async () => {
  vi.useFakeTimers()
  let deliver!: (response: Response) => void
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        deliver = resolve
      }),
    )
    .mockResolvedValueOnce(new Response('# New page'))
  vi.stubGlobal('fetch', fetcher)
  const write = vi.fn(async () => {})
  const update = vi.fn()
  const task = createMarkdownCopy(readMarkdown, write, update)
  const pending = task.copy('/old.md')
  task.reset()
  await pending
  expect(update).toHaveBeenLastCalledWith('idle')
  await task.copy('/new.md')
  deliver(new Response('# Old page'))
  await Promise.resolve()
  await Promise.resolve()
  expect(write).toHaveBeenCalledExactlyOnceWith('# New page')
  expect(update.mock.calls).toEqual([['copying'], ['copying'], ['idle'], ['copying'], ['copied']])
  expect(vi.getTimerCount()).toBe(0)
})

it('copies downloaded Markdown and reports read failures', async () => {
  const read = vi.fn().mockResolvedValueOnce('# Page').mockRejectedValueOnce(new Error('offline'))
  const write = vi.fn(async () => {})
  const update = vi.fn()
  const task = createMarkdownCopy(read, write, update)
  await task.copy('/page.md')
  expect(write).toHaveBeenCalledExactlyOnceWith('# Page')
  expect(update).toHaveBeenLastCalledWith('copied')
  await task.copy('/other.md')
  expect(update).toHaveBeenLastCalledWith('failed')
})

it.each(['reset', 'dispose'] as const)(
  'aborts a download and ignores a late response after %s',
  async (action) => {
    let finish!: (value: string) => void
    const read = vi.fn(
      (_url: string, _signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const write = vi.fn(async () => {})
    const update = vi.fn()
    const task = createMarkdownCopy(read, write, update)
    const pending = task.copy('/old.md')
    task[action]()
    expect(read.mock.calls[0]![1].aborted).toBe(true)
    finish('old Markdown')
    await pending
    expect(write).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalledWith('copied')
    expect(update).not.toHaveBeenCalledWith('failed')
  },
)

it('does not overlap a new page copy with an old clipboard write', async () => {
  let finish!: () => void
  const read = vi.fn(() => Promise.resolve('# Page'))
  const write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const task = createMarkdownCopy(read, write, vi.fn())
  const first = task.copy('/old.md')
  await Promise.resolve()
  task.reset()
  await task.copy('/new.md')
  expect(read).toHaveBeenCalledOnce()
  finish()
  await first
  write.mockResolvedValueOnce(undefined)
  await task.copy('/new.md')
  expect(read).toHaveBeenCalledTimes(2)
})
