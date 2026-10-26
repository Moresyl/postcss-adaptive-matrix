import { expect, it, vi } from 'vitest'
import { createOutputCopy } from '../docs/.vitepress/theme/output-copy'

it.each(['', '/* 中文 */\r\n.card {\n  content: "\\263a";\n}\n'.repeat(4096)])(
  'copies exact output without trimming or truncation (%#)',
  async (output) => {
    const write = vi.fn(async () => {})
    const update = vi.fn()
    const task = createOutputCopy(write, update)
    await task.copy(output, false)
    expect(write).toHaveBeenCalledExactlyOnceWith(output)
    expect(update.mock.calls).toEqual([['copying'], ['copied']])
  },
)

it('releases the write lock after a synchronous clipboard failure', async () => {
  const write = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    .mockResolvedValue(undefined)
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  await task.copy('CSS', false)
  expect(update).toHaveBeenLastCalledWith('failed')
  await task.copy('retry', false)
  expect(write).toHaveBeenCalledTimes(2)
  expect(update).toHaveBeenLastCalledWith('copied')
})

it('suppresses a delayed rejection after reset and permits a fresh copy', async () => {
  let reject!: (error: Error) => void
  const write = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail
      }),
  )
  const update = vi.fn()
  const task = createOutputCopy(write, update)
  const first = task.copy('old CSS', false)
  task.reset()
  reject(new Error('late rejection'))
  await first
  expect(update.mock.calls).toEqual([['copying'], ['copying'], ['idle']])
  write.mockResolvedValueOnce(undefined)
  await task.copy('new CSS', false)
  expect(update).toHaveBeenLastCalledWith('copied')
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

it('suppresses duplicate writes and stale feedback after input changes', async () => {
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

it.each([false, true])(
  'never publishes or starts new writes after disposal (reject=%s)',
  async (reject) => {
    let finish!: () => void
    const write = vi.fn(
      () =>
        new Promise<void>((resolve, fail) => {
          finish = () => (reject ? fail(new Error('denied')) : resolve())
        }),
    )
    const update = vi.fn()
    const task = createOutputCopy(write, update)
    const pending = task.copy('CSS', false)
    task.dispose()
    task.dispose()
    task.reset()
    finish()
    await pending
    await task.copy('new CSS', false)
    expect(write).toHaveBeenCalledOnce()
    expect(update.mock.calls).toEqual([['copying']])
  },
)

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
