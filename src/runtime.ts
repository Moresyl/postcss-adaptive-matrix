import { isObject, isPlainObject, rejectUnknownKeys, valueKind } from './core/validation.js'

export interface AdaptiveViewportObserverOptions {
  prefix?: string
  target?: HTMLElement
  window?: Window
  document?: Document
  /** Abort signal that permanently tears down the observer when aborted. */
  signal?: AbortSignal
}

export interface AdaptiveViewportSnapshot {
  width: number
  height: number
  layoutHeight: number
  keyboardHeight: number
  scale: number
}

export interface AdaptiveViewportObserver {
  update(): AdaptiveViewportSnapshot | null
  destroy(): void
}

const VIEWPORT_OPTION_KEYS = ['prefix', 'target', 'window', 'document', 'signal'] as const

function validateObserverOptions(value: unknown): asserts value is AdaptiveViewportObserverOptions {
  if (!isPlainObject(value)) {
    throw new TypeError(
      `[postcss-adaptive-matrix] viewport options must be an object, not ${valueKind(value)}.`,
    )
  }
  rejectUnknownKeys('viewport options', value, VIEWPORT_OPTION_KEYS)
  for (const field of ['target', 'window', 'document', 'signal'] as const) {
    if (value[field] !== undefined && !isObject(value[field])) {
      throw new TypeError(
        `[postcss-adaptive-matrix] viewport options.${field} must be a browser object, not ${valueKind(value[field])}.`,
      )
    }
  }
  const target = value.target
  if (
    target !== undefined &&
    (!isObject(target) || !isObject(target.style) || typeof target.style.setProperty !== 'function')
  ) {
    throw new TypeError(
      '[postcss-adaptive-matrix] viewport options.target must expose style.setProperty().',
    )
  }
  const browserWindow = value.window
  if (
    browserWindow !== undefined &&
    (!isObject(browserWindow) ||
      typeof browserWindow.addEventListener !== 'function' ||
      typeof browserWindow.removeEventListener !== 'function' ||
      typeof browserWindow.requestAnimationFrame !== 'function' ||
      typeof browserWindow.cancelAnimationFrame !== 'function')
  ) {
    throw new TypeError(
      '[postcss-adaptive-matrix] viewport options.window must expose browser event and animation-frame methods.',
    )
  }
  const visual = isObject(browserWindow) ? browserWindow.visualViewport : undefined
  if (
    visual !== undefined &&
    visual !== null &&
    (!isObject(visual) ||
      typeof visual.addEventListener !== 'function' ||
      typeof visual.removeEventListener !== 'function')
  ) {
    throw new TypeError(
      '[postcss-adaptive-matrix] viewport options.window.visualViewport must expose browser event methods.',
    )
  }
  const browserDocument = value.document
  if (
    browserDocument !== undefined &&
    (!isObject(browserDocument) || !('documentElement' in browserDocument))
  ) {
    throw new TypeError(
      '[postcss-adaptive-matrix] viewport options.document must expose documentElement.',
    )
  }
  const signal = value.signal
  if (
    signal !== undefined &&
    (!isObject(signal) ||
      typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function')
  ) {
    throw new TypeError('[postcss-adaptive-matrix] viewport options.signal must be an AbortSignal.')
  }
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

function positiveFinite(value: number | undefined, fallback: number): number {
  if (Number.isFinite(value) && (value as number) > 0) return value as number
  return fallback
}

function variablePrefix(value: unknown): string {
  const selected = value === undefined ? 'adaptive' : value
  const prefix = typeof selected === 'string' ? selected.replace(/^--/, '') : ''
  if (
    !/^(?:--|-[A-Za-z_\u0080-\uFFFF]|[A-Za-z_\u0080-\uFFFF])[-A-Za-z0-9_\u0080-\uFFFF]*$/.test(
      prefix,
    )
  ) {
    throw new TypeError(
      '[postcss-adaptive-matrix] viewport prefix must be a non-empty CSS identifier, such as "adaptive" or "--app".',
    )
  }
  return prefix
}

/**
 * Publishes VisualViewport metrics as CSS variables for WebView/Capacitor/Tauri
 * shells. The compiler itself remains runtime-free; this helper is optional.
 */
export function observeAdaptiveViewport(
  options: AdaptiveViewportObserverOptions = {},
): AdaptiveViewportObserver {
  validateObserverOptions(options)
  const browserWindow =
    options.window === undefined
      ? typeof window === 'undefined'
        ? undefined
        : window
      : options.window
  const browserDocument =
    options.document === undefined
      ? typeof document === 'undefined'
        ? undefined
        : document
      : options.document
  const target = options.target === undefined ? browserDocument?.documentElement : options.target
  const prefix = variablePrefix(options.prefix)
  // A requestAnimationFrame handle is an unsigned counter and may eventually
  // wrap to zero. `null`, rather than a valid handle value, means idle.
  let frame: number | null = null
  let destroyed = false
  const published = new Map<string, string>()

  const publish = (name: string, value: string): void => {
    if (published.get(name) === value) return
    target!.style.setProperty(name, value)
    published.set(name, value)
  }

  const update = (): AdaptiveViewportSnapshot | null => {
    if (destroyed || !browserWindow || !target) return null
    const visual = browserWindow.visualViewport
    const layoutWidth = positiveFinite(browserWindow.innerWidth, 0)
    const layoutHeight = positiveFinite(browserWindow.innerHeight, 0)
    const width = positiveFinite(visual?.width, layoutWidth)
    const height = positiveFinite(visual?.height, layoutHeight)
    const scale = positiveFinite(visual?.scale, 1)
    const offsetTop = Math.max(0, finite(visual?.offsetTop, 0))
    // Pinch zoom shrinks VisualViewport just like a keyboard does. At scale 2,
    // a full-height 800 px layout legitimately has a 400 px visual viewport;
    // calling the missing 400 px a keyboard pushes controls off-screen. The
    // unoccluded height at the current zoom is layout/scale. Offset is useful
    // at scale 1 (the browser may pan an input above the keyboard), but at a
    // zoomed scale it is ordinary user panning and must not hide real shrinkage.
    const zoomed = Math.abs(scale - 1) > 0.01
    const keyboardHeight = Math.max(0, layoutHeight / scale - height - (zoomed ? 0 : offsetTop))
    const snapshot = { width, height, layoutHeight, keyboardHeight, scale }
    for (const [name, value] of Object.entries(snapshot)) {
      const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      publish(`--${prefix}-${cssName}`, String(value))
      if (destroyed) return null
    }
    publish(`--${prefix}-vh`, `${height / 100}px`)
    if (destroyed) return null
    publish(`--${prefix}-vw`, `${width / 100}px`)
    return destroyed ? null : snapshot
  }

  // Only the scheduler clears the handle. `update` is public, and having it
  // clear the handle meant a manual call in front of a queued frame left that
  // frame both pending and unrecorded — `destroy` then had nothing to cancel
  // and the write landed on a torn-down observer one tick later.
  const schedule = () => {
    if (destroyed || !browserWindow || frame !== null) return
    frame = browserWindow.requestAnimationFrame(() => {
      frame = null
      try {
        update()
      } catch {
        // There is no promise or return value through which an animation-frame
        // callback can hand an update failure back to the caller. Tear down
        // before swallowing the host error, otherwise every later viewport
        // event repeats it and keeps a broken observer alive indefinitely.
        observer.destroy()
      }
    })
  }

  if (!browserWindow || !target) {
    return { update, destroy() {} }
  }

  if (options.signal?.aborted) {
    destroyed = true
    return { update, destroy() {} }
  }

  const observer: AdaptiveViewportObserver = {
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      if (frame !== null) browserWindow.cancelAnimationFrame(frame)
      // Cleared so a second destroy cannot cancel whatever the host has since
      // reissued this handle to.
      frame = null
      browserWindow.removeEventListener('resize', schedule)
      browserWindow.removeEventListener('orientationchange', schedule)
      browserWindow.visualViewport?.removeEventListener('resize', schedule)
      browserWindow.visualViewport?.removeEventListener('scroll', schedule)
      options.signal?.removeEventListener('abort', abort)
    },
  }
  const abort = () => observer.destroy()
  try {
    browserWindow.addEventListener('resize', schedule, { passive: true })
    browserWindow.addEventListener('orientationchange', schedule, { passive: true })
    browserWindow.visualViewport?.addEventListener('resize', schedule, {
      passive: true,
    })
    browserWindow.visualViewport?.addEventListener('scroll', schedule, {
      passive: true,
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    update()
  } catch (error) {
    // Construction is transactional: callers cannot destroy an observer that
    // was never returned, so roll back every listener if initial publication
    // (or a host registration hook) rejects the setup.
    observer.destroy()
    throw error
  }
  return observer
}
