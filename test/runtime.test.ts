import { describe, expect, it, vi } from 'vitest'
import { observeAdaptiveViewport } from '../src/runtime.js'

/**
 * A window stub with a controllable frame queue.
 *
 * The scheduler is the part of this module that cannot be observed by calling
 * `update()`: it exists to coalesce a burst of resize events into one write,
 * and every test of it has to be able to say when the frame runs. `flush` plays
 * the queue; `pending` is what `destroy` is supposed to cancel.
 */
function stubWindow(visualViewport: unknown, overrides: Record<string, unknown> = {}) {
  const queue = new Map<number, () => void>()
  let nextHandle = 1
  const listeners = { add: vi.fn(), remove: vi.fn() }
  const browserWindow = {
    innerWidth: 390,
    innerHeight: 800,
    visualViewport,
    requestAnimationFrame: vi.fn((callback: () => void) => {
      const handle = nextHandle
      nextHandle += 1
      queue.set(handle, callback)
      return handle
    }),
    cancelAnimationFrame: vi.fn((handle: number) => queue.delete(handle)),
    addEventListener: listeners.add,
    removeEventListener: listeners.remove,
    ...overrides,
  } as unknown as Window

  return {
    window: browserWindow,
    listeners,
    pending: () => queue.size,
    /** Runs every queued frame, in order. */
    flush: () => {
      for (const callback of [...queue.values()]) callback()
      queue.clear()
    },
    /** The `schedule` callback registered for `type`, as the browser would fire it. */
    fire: (type: string) => {
      const entry = listeners.add.mock.calls.find((call) => call[0] === type)
      expect(entry, `no listener registered for ${type}`).toBeDefined()
      ;(entry![1] as () => void)()
    },
  }
}

function stubTarget() {
  const values = new Map<string, string>()
  const setProperty = vi.fn((name: string, value: string) => values.set(name, value))
  return { element: { style: { setProperty } } as unknown as HTMLElement, values, setProperty }
}

describe('observeAdaptiveViewport', () => {
  it('is an SSR-safe no-op', () => {
    const observer = observeAdaptiveViewport({
      window: undefined,
      document: undefined,
    })
    expect(observer.update()).toBeNull()
    expect(() => observer.destroy()).not.toThrow()
  })

  it('is a no-op when there is a window but nothing to write to', () => {
    // A worker, or a document that has not parsed its root element yet. The
    // observer must not register listeners it can never usefully answer.
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({
      window: host.window,
      document: undefined,
      target: undefined,
    })
    expect(observer.update()).toBeNull()
    expect(host.listeners.add).not.toHaveBeenCalled()
    expect(() => observer.destroy()).not.toThrow()
  })

  it('publishes pinch-aware visual viewport and keyboard metrics, then cleans up', () => {
    const target = stubTarget()
    const host = stubWindow({
      width: 390,
      height: 500,
      scale: 1,
      offsetTop: 20,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
      prefix: '--matrix',
    })
    const snapshot = observer.update()

    expect(snapshot).toEqual({
      width: 390,
      height: 500,
      layoutHeight: 800,
      keyboardHeight: 280,
      scale: 1,
    })
    expect(target.values.get('--matrix-keyboard-height')).toBe('280')
    expect(target.values.get('--matrix-vh')).toBe('5px')
    expect(target.values.get('--matrix-vw')).toBe('3.9px')
    expect(host.listeners.add).toHaveBeenCalledTimes(2)
    expect(host.window.visualViewport!.addEventListener).toHaveBeenCalledTimes(2)

    observer.destroy()
    expect(host.listeners.remove).toHaveBeenCalledTimes(2)
    expect(host.window.visualViewport!.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('falls back to the layout viewport where VisualViewport is missing', () => {
    // Android WebViews below Chrome 61 and desktop Safari below 13 have no
    // `visualViewport` at all. The variables still have to be published, or a
    // stylesheet reading `--adaptive-vh` gets nothing on exactly the shells
    // this helper exists for.
    const target = stubTarget()
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })

    expect(observer.update()).toEqual({
      width: 390,
      height: 800,
      layoutHeight: 800,
      keyboardHeight: 0,
      scale: 1,
    })
    expect(target.values.get('--adaptive-vh')).toBe('8px')
    // Only the two window events; there is no visual viewport to subscribe to.
    expect(host.listeners.add).toHaveBeenCalledTimes(2)
    expect(() => observer.destroy()).not.toThrow()
  })

  it('reports no keyboard when the visual viewport is taller than the layout one', () => {
    // iOS reports a visual viewport larger than the layout viewport during
    // rubber-band overscroll. Subtracting gives a negative height, and a
    // negative `--adaptive-keyboard-height` would push content off-screen
    // wherever it is used as a bottom offset.
    const target = stubTarget()
    const host = stubWindow({
      width: 390,
      height: 860,
      scale: 1,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    expect(observer.update()!.keyboardHeight).toBe(0)
    observer.destroy()
  })

  it('does not mistake a pinch-zoomed viewport for an on-screen keyboard', () => {
    const target = stubTarget()
    const visual = {
      width: 195,
      height: 400,
      scale: 2,
      offsetTop: 100,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const host = stubWindow(visual)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })

    expect(observer.update()!.keyboardHeight).toBe(0)
    // Shrinking below the full height at the current scale still reports a
    // keyboard, even when the zoomed viewport has been panned.
    visual.height = 250
    const beforeKeyboard = target.setProperty.mock.calls.length
    expect(observer.update()!.keyboardHeight).toBe(150)
    expect(target.setProperty.mock.calls.length - beforeKeyboard).toBe(3)
    observer.destroy()
  })

  it('substitutes the layout viewport for individually unusable readings', () => {
    // Some WebViews expose the object with fields that are not numbers yet.
    const target = stubTarget()
    const host = stubWindow({
      width: Number.NaN,
      height: undefined,
      scale: Number.POSITIVE_INFINITY,
      offsetTop: Number.NaN,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    expect(observer.update()).toEqual({
      width: 390,
      height: 800,
      layoutHeight: 800,
      keyboardHeight: 0,
      scale: 1,
    })
    observer.destroy()
  })

  it('coalesces a burst of events into one frame', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    const afterMount = target.setProperty.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    host.fire('resize')
    host.fire('orientationchange')
    host.fire('resize')
    expect(host.window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(target.setProperty.mock.calls.length).toBe(afterMount)

    host.flush()
    // The viewport did not change. Scheduling is coalesced and publishing is
    // deduplicated, so a noisy resize burst causes no second set of DOM writes.
    expect(target.setProperty.mock.calls.length).toBe(afterMount)

    // The handle is released by the frame, so the next burst schedules again.
    host.fire('resize')
    expect(host.window.requestAnimationFrame).toHaveBeenCalledTimes(2)
    observer.destroy()
  })

  it('cancels a queued frame even after a manual update', () => {
    // `update` is public. It used to clear the scheduler's handle, which left
    // the queued frame pending and unrecorded: `destroy` had nothing to cancel
    // and the write landed on a torn-down observer a tick later.
    const target = stubTarget()
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })

    host.fire('resize')
    expect(host.pending()).toBe(1)
    observer.update()
    observer.destroy()

    expect(host.window.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(host.pending()).toBe(0)

    const afterDestroy = target.setProperty.mock.calls.length
    host.flush()
    expect(target.setProperty.mock.calls.length).toBe(afterDestroy)
  })

  it('survives being destroyed twice', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    host.fire('resize')
    observer.destroy()
    observer.destroy()
    // The second call must not cancel a handle the host has since reissued.
    expect(host.window.cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('coalesces and cancels a frame whose browser handle is zero', () => {
    const target = stubTarget()
    let queued: (() => void) | undefined
    const requestAnimationFrame = vi.fn((callback: () => void) => {
      queued = callback
      return 0
    })
    const cancelAnimationFrame = vi.fn()
    const host = stubWindow(undefined, { requestAnimationFrame, cancelAnimationFrame })
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })

    host.fire('resize')
    host.fire('orientationchange')
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    observer.destroy()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(0)
    const writes = target.setProperty.mock.calls.length
    queued!()
    expect(target.setProperty).toHaveBeenCalledTimes(writes)
    expect(observer.update()).toBeNull()
  })

  it('reads the globals when it is given nothing at all', () => {
    // `observeAdaptiveViewport()` with no arguments is how every browser
    // consumer calls it; the options exist for tests and for shells that hand
    // over a different window. Under Node both globals are absent, so this is
    // the one path the rest of the file cannot reach.
    const target = stubTarget()
    const host = stubWindow(undefined)
    const globals = globalThis as Record<string, unknown>
    const saved = new Map(
      (['window', 'document'] as const)
        .filter((key) => key in globals)
        .map((key) => [key, globals[key]] as const),
    )
    globals.window = host.window
    globals.document = { documentElement: target.element }
    try {
      const observer = observeAdaptiveViewport()
      expect(observer.update()).not.toBeNull()
      expect(target.values.get('--adaptive-width')).toBe('390')
      observer.destroy()
    } finally {
      for (const key of ['window', 'document'] as const) {
        if (saved.has(key)) globals[key] = saved.get(key)
        else delete globals[key]
      }
    }
  })

  it('takes its target from the document when none is given', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    const observer = observeAdaptiveViewport({
      window: host.window,
      document: { documentElement: target.element } as unknown as Document,
    })
    expect(observer.update()).not.toBeNull()
    expect(target.values.get('--adaptive-width')).toBe('390')
    observer.destroy()
  })

  it('rejects a prefix that cannot form valid custom-property names', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    for (const prefix of ['', '--', 'two words', '9app', null]) {
      expect(() =>
        observeAdaptiveViewport({
          window: host.window,
          target: target.element,
          prefix: prefix as never,
        }),
      ).toThrow(/viewport prefix must be a non-empty CSS identifier/)
    }
    expect(host.listeners.add).not.toHaveBeenCalled()
  })

  it('distinguishes omitted runtime options from malformed explicit values', () => {
    for (const options of [null, [], 'adaptive']) {
      expect(() => observeAdaptiveViewport(options as never)).toThrow(
        /viewport options must be an object/,
      )
    }
    for (const field of ['target', 'window', 'document'] as const) {
      expect(() => observeAdaptiveViewport({ [field]: null })).toThrow(
        new RegExp(`viewport options\\.${field} must be a browser object`),
      )
    }
    expect(() => observeAdaptiveViewport({ windw: {} } as never)).toThrow(
      /viewport options\.windw.*Did you mean "window"/,
    )
  })
})
