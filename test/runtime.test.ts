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
  const setProperty = vi.fn((name: string, value: string) => {
    values.set(name, value)
  })
  return { element: { style: { setProperty } } as unknown as HTMLElement, values, setProperty }
}

describe('observeAdaptiveViewport', () => {
  it.each(['frame', 'window', 'viewport', 'signal'])(
    'continues teardown when the host rejects %s cleanup',
    (failure) => {
      const visual = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
      const host = stubWindow(visual)
      const target = stubTarget()
      const controller = new AbortController()
      const removeSignal = vi.spyOn(controller.signal, 'removeEventListener')
      const cancelFrame = vi.spyOn(host.window, 'cancelAnimationFrame')
      const observer = observeAdaptiveViewport({
        window: host.window,
        target: target.element,
        signal: controller.signal,
      })
      const reject = () => {
        throw new Error('host teardown rejected')
      }
      if (failure === 'frame') cancelFrame.mockImplementationOnce(reject)
      if (failure === 'window') host.listeners.remove.mockImplementationOnce(reject)
      if (failure === 'viewport') visual.removeEventListener.mockImplementationOnce(reject)
      if (failure === 'signal') removeSignal.mockImplementationOnce(reject)
      host.fire('resize')
      expect(() => observer.destroy()).not.toThrow()
      expect(cancelFrame).toHaveBeenCalledTimes(1)
      expect(host.listeners.remove).toHaveBeenCalledTimes(2)
      expect(visual.removeEventListener).toHaveBeenCalledTimes(2)
      expect(removeSignal).toHaveBeenCalledTimes(1)
      const writes = target.setProperty.mock.calls.length
      Object.assign(host.window, { innerWidth: 500 })
      host.flush()
      host.fire('resize')
      expect(observer.update()).toBeNull()
      expect(host.pending()).toBe(0)
      expect(target.setProperty).toHaveBeenCalledTimes(writes)
      observer.destroy()
      expect(cancelFrame).toHaveBeenCalledTimes(1)
      removeSignal.mockRestore()
    },
  )

  it('preserves the original setup failure when rollback also fails', () => {
    const visual = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const host = stubWindow(visual)
    const target = stubTarget()
    const original = new Error('initial publication rejected')
    target.setProperty.mockImplementationOnce(() => {
      throw original
    })
    host.listeners.remove.mockImplementationOnce(() => {
      throw new Error('secondary cleanup failure')
    })
    expect(() => observeAdaptiveViewport({ window: host.window, target: target.element })).toThrow(
      original,
    )
    expect(host.listeners.remove).toHaveBeenCalledTimes(2)
    expect(visual.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('keeps an injected window independent from the default document', () => {
    const outer = stubTarget()
    const inner = stubTarget()
    const host = stubWindow(null, { document: { documentElement: inner.element } })
    vi.stubGlobal('document', { documentElement: outer.element })
    let observer: ReturnType<typeof observeAdaptiveViewport> | undefined
    try {
      observer = observeAdaptiveViewport({ window: host.window })
      expect(outer.values.get('--adaptive-width')).toBe('390')
      expect(inner.setProperty).not.toHaveBeenCalled()
      host.fire('resize')
      observer.destroy()
      expect(host.pending()).toBe(0)
    } finally {
      observer?.destroy()
      vi.unstubAllGlobals()
    }
  })

  it('lets an explicit target override both injected and ambient documents', () => {
    const outer = stubTarget()
    const inner = stubTarget()
    const target = stubTarget()
    const host = stubWindow(null)
    vi.stubGlobal('document', { documentElement: outer.element })
    let observer: ReturnType<typeof observeAdaptiveViewport> | undefined
    try {
      observer = observeAdaptiveViewport({
        window: host.window,
        document: { documentElement: inner.element } as unknown as Document,
        target: target.element,
      })
      expect(target.values.get('--adaptive-height')).toBe('800')
      expect(outer.setProperty).not.toHaveBeenCalled()
      expect(inner.setProperty).not.toHaveBeenCalled()
    } finally {
      observer?.destroy()
      vi.unstubAllGlobals()
    }
  })

  it('keeps prepared variable names isolated between observers', () => {
    const host = stubWindow(null)
    const first = stubTarget()
    const second = stubTarget()
    const observers = [first, second].map((target, index) =>
      observeAdaptiveViewport({
        window: host.window,
        target: target.element,
        prefix: index === 0 ? 'first' : '--second',
      }),
    )
    try {
      Object.assign(host.window, { innerHeight: 600 })
      for (const observer of observers) observer.update()
      for (const [index, target] of [first, second].entries()) {
        const prefix = index === 0 ? 'first' : 'second'
        expect([...target.values.keys()]).toEqual(
          ['width', 'height', 'layout-height', 'keyboard-height', 'scale', 'vh', 'vw'].map(
            (name) => `--${prefix}-${name}`,
          ),
        )
        expect(target.values.get(`--${prefix}-layout-height`)).toBe('600')
        expect(target.values.get(`--${prefix}-vh`)).toBe('6px')
      }
    } finally {
      for (const observer of observers) observer.destroy()
    }
  })

  it('rolls back partial registration when the host rejects a later listener', () => {
    const host = stubWindow(null)
    const target = stubTarget()
    const active = new Map<string, unknown>()
    host.listeners.add.mockImplementation((event: string, listener: unknown) => {
      if (event === 'orientationchange') throw new Error('listener registration rejected')
      active.set(event, listener)
    })
    host.listeners.remove.mockImplementation((event: string) => active.delete(event))

    expect(() => observeAdaptiveViewport({ window: host.window, target: target.element })).toThrow(
      'listener registration rejected',
    )
    expect(active.size).toBe(0)
    expect(target.setProperty).not.toHaveBeenCalled()
    expect(host.pending()).toBe(0)
  })

  it('honors cancellation triggered by a host during listener registration', () => {
    const controller = new AbortController()
    const host = stubWindow(null)
    const target = stubTarget()
    host.listeners.add.mockImplementationOnce(() => controller.abort())
    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
      signal: controller.signal,
    })
    expect(target.setProperty).not.toHaveBeenCalled()
    expect(observer.update()).toBeNull()
    expect(host.listeners.remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(host.listeners.remove).toHaveBeenCalledWith('orientationchange', expect.any(Function))
    host.fire('resize')
    expect(host.pending()).toBe(0)
  })

  it('cleans up the original abort signal if the options object changes', () => {
    const first = new AbortController()
    const second = new AbortController()
    const removeFirst = vi.spyOn(first.signal, 'removeEventListener')
    const removeSecond = vi.spyOn(second.signal, 'removeEventListener')
    const host = stubWindow(null)
    const target = stubTarget()
    const options = { window: host.window, target: target.element, signal: first.signal }
    const observer = observeAdaptiveViewport(options)
    options.signal = second.signal
    observer.destroy()
    expect(removeFirst).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(removeSecond).not.toHaveBeenCalled()
  })

  it('removes listeners from the original viewport when a host replaces it', () => {
    const original = {
      width: 390,
      height: 700,
      scale: 1,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const replacement = { ...original, removeEventListener: vi.fn(), width: 420 }
    const host = stubWindow(original)
    const target = stubTarget()
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    Object.defineProperty(host.window, 'visualViewport', { value: replacement })
    expect(observer.update()?.width).toBe(420)
    observer.destroy()
    for (const [event, listener] of original.addEventListener.mock.calls) {
      expect(original.removeEventListener).toHaveBeenCalledWith(event, listener)
    }
    expect(replacement.removeEventListener).not.toHaveBeenCalled()
    expect(observer.update()).toBeNull()
  })

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

  it('does not publish an infinite estimate when finite host readings overflow', () => {
    const target = stubTarget()
    const visual = {
      width: 390,
      height: 800,
      scale: Number.MIN_VALUE,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const host = stubWindow(visual)
    const observer = observeAdaptiveViewport({ window: host.window, target: target.element })
    expect(observer.update()!.keyboardHeight).toBe(0)
    expect([...target.values.values()].every((value) => !/Infinity|NaN/.test(value))).toBe(true)
    visual.scale = 1
    visual.height = 500
    expect(observer.update()!.keyboardHeight).toBe(300)
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
    const PretendsToBeObject = { Object: class Object {} }.Object
    for (const options of [null, [], 'adaptive', new Date(), new PretendsToBeObject()]) {
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
    expect(() => observeAdaptiveViewport({ signal: {} as never })).toThrow(
      /viewport options\.signal must be an AbortSignal/,
    )
    expect(() => observeAdaptiveViewport({ target: {} as never })).toThrow(
      /viewport options\.target must expose style\.setProperty/,
    )
    expect(() => observeAdaptiveViewport({ window: {} as never })).toThrow(
      /viewport options\.window must expose browser event and animation-frame methods/,
    )
    expect(() => observeAdaptiveViewport({ document: {} as never })).toThrow(
      /viewport options\.document must expose documentElement/,
    )
    const host = stubWindow({})
    expect(() =>
      observeAdaptiveViewport({ window: host.window, target: stubTarget().element }),
    ).toThrow(/viewport options\.window\.visualViewport must expose browser event methods/)
    const primitiveVisual = stubWindow(42)
    expect(() =>
      observeAdaptiveViewport({ window: primitiveVisual.window, target: stubTarget().element }),
    ).toThrow(/viewport options\.window\.visualViewport must expose browser event methods/)
  })

  it('tears down automatically when an optional abort signal fires', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    const controller = new AbortController()
    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
      signal: controller.signal,
    })
    host.fire('resize')
    expect(host.pending()).toBe(1)

    controller.abort()
    expect(host.window.cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(host.pending()).toBe(0)
    expect(observer.update()).toBeNull()

    const writes = target.setProperty.mock.calls.length
    host.flush()
    expect(target.setProperty).toHaveBeenCalledTimes(writes)
  })

  it('can abort safely during the initial CSS-variable publication', () => {
    const host = stubWindow(undefined)
    const controller = new AbortController()
    const target = stubTarget()
    target.setProperty.mockImplementationOnce(() => controller.abort())

    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
      signal: controller.signal,
    })

    expect(observer.update()).toBeNull()
    expect(host.listeners.remove).toHaveBeenCalledTimes(2)
    // Publication stops at the next variable because abort made update inert
    // only after the current setProperty returned.
    expect(target.setProperty).toHaveBeenCalledTimes(1)
  })

  it('rolls back listeners when initial CSS-variable publication fails', () => {
    const visual = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const host = stubWindow(visual)
    const target = stubTarget()
    target.setProperty.mockImplementationOnce(() => {
      throw new Error('host rejected the CSS write')
    })

    expect(() =>
      observeAdaptiveViewport({
        window: host.window,
        target: target.element,
      }),
    ).toThrow('host rejected the CSS write')

    expect(host.listeners.remove).toHaveBeenCalledTimes(2)
    expect(visual.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('tears down after an animation-frame publication fails', () => {
    const host = stubWindow(undefined)
    const target = stubTarget()
    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
    })
    target.setProperty.mockImplementationOnce(() => {
      throw new Error('detached style target')
    })
    ;(host.window as unknown as { innerWidth: number }).innerWidth = 400

    host.fire('resize')
    expect(() => host.flush()).not.toThrow()

    expect(host.listeners.remove).toHaveBeenCalledTimes(2)
    expect(observer.update()).toBeNull()
  })

  it('does not publish or register listeners for an already-aborted signal', () => {
    const target = stubTarget()
    const host = stubWindow(undefined)
    const controller = new AbortController()
    controller.abort()
    const observer = observeAdaptiveViewport({
      window: host.window,
      target: target.element,
      signal: controller.signal,
    })

    expect(observer.update()).toBeNull()
    expect(target.setProperty).not.toHaveBeenCalled()
    expect(host.listeners.add).not.toHaveBeenCalled()
  })
})
