import { expect, it, vi } from 'vitest'
import { createOutputCopy } from '../docs/.vitepress/theme/output-copy'

it('copies exact output including an empty successful stylesheet', async () => {
  const write = vi.fn(async () => {})
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  await task.copy('', false)
  expect(write).toHaveBeenCalledExactlyOnceWith('')
  expect(update.mock.calls).toEqual([['copying'], ['copied']])
})

it('does not copy missing or stale output', async () => {
  const write = vi.fn(async () => {})
  const task = createOutputCopy(write, vi.fn())
  await task.copy(null, false)
  await task.copy('old CSS', true)
  expect(write).not.toHaveBeenCalled()
})

it('reports permission failures and allows retry', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  await task.copy('CSS', false)
  expect(update).toHaveBeenLastCalledWith('failed')
  await task.copy('CSS', false)
  expect(update).toHaveBeenLastCalledWith('copied')
})

it('suppresses duplicate writes and stale feedback after input changes or disposal', async () => {
  let finish!: () => void
  const write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  const pending = task.copy('old CSS', false)
  await task.copy('old CSS', false)
  expect(write).toHaveBeenCalledOnce()
  task.reset()
  finish()
  await pending
  expect(update.mock.calls).toEqual([['copying'], ['copying'], ['idle']])
})

it('serializes a retry until an invalidated clipboard write settles', async () => {
  let finish!: () => void
  const write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  const first = task.copy('old', false)
  task.reset()
  await task.copy('new', false)
  expect(write).toHaveBeenCalledOnce()
  finish()
  await first
  write.mockResolvedValueOnce(undefined)
  await task.copy('new', false)
  expect(write).toHaveBeenCalledTimes(2)
})
