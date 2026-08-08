export interface AdaptiveViewportObserverOptions {
  prefix?: string
  target?: HTMLElement
  window?: Window
  document?: Document
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

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

/**
 * Publishes VisualViewport metrics as CSS variables for WebView/Capacitor/Tauri
 * shells. The compiler itself remains runtime-free; this helper is optional.
 */
export function observeAdaptiveViewport(
  options: AdaptiveViewportObserverOptions = {},
): AdaptiveViewportObserver {
  const browserWindow =
    options.window ?? (typeof window === 'undefined' ? undefined : window)
  const browserDocument =
    options.document ??
    (typeof document === 'undefined' ? undefined : document)
  const target = options.target ?? browserDocument?.documentElement
  const prefix = (options.prefix ?? 'adaptive').replace(/^--/, '')
  let frame = 0

  const update = (): AdaptiveViewportSnapshot | null => {
    frame = 0
    if (!browserWindow || !target) return null
    const visual = browserWindow.visualViewport
    const width = finite(visual?.width, browserWindow.innerWidth)
    const height = finite(visual?.height, browserWindow.innerHeight)
    const scale = finite(visual?.scale, 1)
    const layoutHeight = browserWindow.innerHeight
    const keyboardHeight = Math.max(0, layoutHeight - height - finite(visual?.offsetTop, 0))
    const snapshot = { width, height, layoutHeight, keyboardHeight, scale }
    for (const [name, value] of Object.entries(snapshot)) {
      const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      target.style.setProperty(`--${prefix}-${cssName}`, String(value))
    }
    target.style.setProperty(`--${prefix}-vh`, `${height / 100}px`)
    target.style.setProperty(`--${prefix}-vw`, `${width / 100}px`)
    return snapshot
  }

  const schedule = () => {
    if (!browserWindow || frame) return
    frame = browserWindow.requestAnimationFrame(update)
  }

  if (!browserWindow || !target) {
    return { update, destroy() {} }
  }

  browserWindow.addEventListener('resize', schedule, { passive: true })
  browserWindow.addEventListener('orientationchange', schedule, { passive: true })
  browserWindow.visualViewport?.addEventListener('resize', schedule, {
    passive: true,
  })
  browserWindow.visualViewport?.addEventListener('scroll', schedule, {
    passive: true,
  })
  update()

  return {
    update,
    destroy() {
      if (frame) browserWindow.cancelAnimationFrame(frame)
      browserWindow.removeEventListener('resize', schedule)
      browserWindow.removeEventListener('orientationchange', schedule)
      browserWindow.visualViewport?.removeEventListener('resize', schedule)
      browserWindow.visualViewport?.removeEventListener('scroll', schedule)
    },
  }
}
