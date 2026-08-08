import { describe, expect, it, vi } from 'vitest'
import { observeAdaptiveViewport } from '../src/runtime.js'

describe('observeAdaptiveViewport', () => {
  it('is an SSR-safe no-op', () => {
    const observer = observeAdaptiveViewport({
      window: undefined,
      document: undefined,
    })
    expect(observer.update()).toBeNull()
    expect(() => observer.destroy()).not.toThrow()
  })

  it('publishes visual viewport and keyboard metrics, then cleans up', () => {
    const values = new Map<string, string>()
    const target = {
      style: {
        setProperty: vi.fn((name: string, value: string) => values.set(name, value)),
      },
    } as unknown as HTMLElement
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const visualAdd = vi.fn()
    const visualRemove = vi.fn()
    const browserWindow = {
      innerWidth: 390,
      innerHeight: 800,
      visualViewport: {
        width: 390,
        height: 500,
        scale: 1.25,
        offsetTop: 20,
        addEventListener: visualAdd,
        removeEventListener: visualRemove,
      },
      requestAnimationFrame: vi.fn(() => 7),
      cancelAnimationFrame: vi.fn(),
      addEventListener,
      removeEventListener,
    } as unknown as Window

    const observer = observeAdaptiveViewport({
      window: browserWindow,
      target,
      prefix: '--matrix',
    })
    const snapshot = observer.update()

    expect(snapshot).toEqual({
      width: 390,
      height: 500,
      layoutHeight: 800,
      keyboardHeight: 280,
      scale: 1.25,
    })
    expect(values.get('--matrix-keyboard-height')).toBe('280')
    expect(values.get('--matrix-vh')).toBe('5px')
    expect(values.get('--matrix-vw')).toBe('3.9px')
    expect(addEventListener).toHaveBeenCalledTimes(2)
    expect(visualAdd).toHaveBeenCalledTimes(2)

    observer.destroy()
    expect(removeEventListener).toHaveBeenCalledTimes(2)
    expect(visualRemove).toHaveBeenCalledTimes(2)
  })
})
