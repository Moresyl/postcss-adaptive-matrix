import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompilerTask } from '../docs/.vitepress/theme/compiler-task'

afterEach(() => vi.useRealTimers())

function fixture() {
  vi.useFakeTimers()
  const workers: Worker[] = []
  const receive = vi.fn()
  const fail = vi.fn()
  const create = vi.fn(() => {
    const worker = { terminate: vi.fn(), postMessage: vi.fn() } as unknown as Worker
    workers.push(worker)
    return worker
  })
  return { task: createCompilerTask(create, receive, fail), workers, receive, fail, create }
}
const input = { css: '.a {}', options: '{}' }
const event = { data: { css: '.a {}' } } as MessageEvent

describe('disposable compiler task', () => {
  it.each([
    null,
    undefined,
    'unexpected',
    {},
    { css: 123 },
    { css: '', duration: 'fast' },
    { css: '', duration: Number.NaN },
    { css: '', duration: Infinity },
    { css: '', duration: -1 },
    { css: '', warnings: [null] },
    { css: '', warnings: [{ text: 1 }] },
    { css: '', warnings: {} },
    { css: '', warnings: new Array(1) },
    { error: 123 },
  ])('rejects malformed Worker payloads without publishing: %j', (data) => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    const old = workers[0]!
    expect(() => old.onmessage!.call(old, { data } as MessageEvent)).not.toThrow()
    expect(receive).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledExactlyOnceWith('worker')
    expect(old.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    task.run(input)
    old.onmessage!.call(old, event)
    expect(receive).not.toHaveBeenCalled()
    workers[1]!.onmessage!.call(workers[1]!, event)
    expect(receive).toHaveBeenCalledExactlyOnceWith(event.data)
  })

  it('rejects an array response without Vitest spreading it into arguments', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    const worker = workers[0]!
    worker.onmessage!.call(worker, { data: [] } as MessageEvent)
    expect(receive).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledExactlyOnceWith('worker')
  })

  it.each([
    { css: '', warnings: [], duration: 0 },
    { css: '.a {}', warnings: [{ text: 'A warning' }], duration: 1.5 },
    { error: 'Invalid configuration' },
  ])('accepts valid success and error responses: %j', (data) => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    const worker = workers[0]!
    worker.onmessage!.call(worker, { data } as MessageEvent)
    expect(receive).toHaveBeenCalledExactlyOnceWith(data)
    expect(fail).not.toHaveBeenCalled()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails immediately on message decoding errors and ignores stale ones', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    const old = workers[0]!
    expect(old.onmessageerror).toBeTypeOf('function')
    old.onmessageerror!.call(old, {} as MessageEvent)
    expect(fail).toHaveBeenCalledExactlyOnceWith('worker')
    expect(old.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    task.run(input)
    old.onmessageerror!.call(old, {} as MessageEvent)
    expect(fail).toHaveBeenCalledOnce()
    workers[1]!.onmessage!.call(workers[1]!, event)
    expect(receive).toHaveBeenCalledExactlyOnceWith(event.data)
  })

  it('publishes once and clears the deadline after success', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    expect(workers[0]!.postMessage).toHaveBeenCalledWith(input)
    const callback = workers[0]!.onmessage!
    callback.call(workers[0]!, event)
    callback.call(workers[0]!, event)
    vi.runAllTimers()
    expect(receive).toHaveBeenCalledExactlyOnceWith(event.data)
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
    expect(fail).not.toHaveBeenCalled()
  })

  it('ignores messages and errors from a replaced worker', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    task.run(input)
    workers[0]!.onmessage!.call(workers[0]!, event)
    workers[0]!.onerror!.call(workers[0]!, {} as ErrorEvent)
    expect(receive).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
    task.stop()
    vi.runAllTimers()
    expect(fail).not.toHaveBeenCalled()
  })

  it('terminates at five seconds and accepts a subsequent run', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    vi.advanceTimersByTime(4999)
    expect(fail).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fail).toHaveBeenCalledExactlyOnceWith('timeout')
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
    task.run(input)
    workers[1]!.onmessage!.call(workers[1]!, event)
    expect(receive).toHaveBeenCalledOnce()
  })

  it('stops idempotently without publishing after disposal', () => {
    const { task, workers, receive, fail } = fixture()
    task.run(input)
    task.stop()
    task.stop()
    workers[0]!.onmessage!.call(workers[0]!, event)
    vi.runAllTimers()
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
    expect(receive).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })

  it('handles worker errors and clears their deadline', () => {
    const { task, workers, fail } = fixture()
    task.run(input)
    workers[0]!.onerror!.call(workers[0]!, {} as ErrorEvent)
    vi.runAllTimers()
    expect(fail).toHaveBeenCalledExactlyOnceWith('worker')
    expect(workers[0]!.terminate).toHaveBeenCalledOnce()
  })

  it('reports startup failure without leaving a timer', () => {
    const { task, create, fail } = fixture()
    create.mockImplementation(() => {
      throw new Error('unavailable')
    })
    task.run(input)
    expect(fail.mock.calls[0]![0].message).toBe('unavailable')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up when posting the input throws', () => {
    const { task, create, fail } = fixture()
    const terminate = vi.fn()
    create.mockReturnValue({
      terminate,
      postMessage: () => {
        throw new Error('cannot clone')
      },
    } as unknown as Worker)
    task.run(input)
    expect(fail.mock.calls[0]![0].message).toBe('cannot clone')
    expect(terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
