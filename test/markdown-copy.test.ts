import { expect, it, vi } from 'vitest'
import { createMarkdownCopy } from '../docs/.vitepress/theme/markdown-copy'

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
