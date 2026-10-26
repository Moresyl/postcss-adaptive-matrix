# Optional runtime

**English** · [简体中文](./runtime.zh-CN.md)

The compiler itself emits no JavaScript at all. This module is a separate entry point, **not needed by default**, and is only worth importing when CSS viewport units disagree with the area the user can actually see.

```js
import { observeAdaptiveViewport } from 'postcss-adaptive-matrix/runtime'

const observer = observeAdaptiveViewport()
// when the component unmounts or the page is left
observer.destroy()
```

## When you need it

CSS `vw` / `vh` refer to the **layout viewport**, which browsers deliberately hold still when the on-screen keyboard appears or the page is pinch-zoomed. Most of the time that is the right behaviour. In a few situations it is not:

| Situation | What you see |
| --- | --- |
| A mobile keyboard opens | `100vh` is still the full screen height, and the bottom button is behind the keyboard |
| The user pinch-zooms | Viewport units do not change, and fixed elements drift off screen |
| The iOS Safari address bar collapses or expands | `100vh` differs from the visible height by one address bar |
| A WebView / Capacitor / Tauri shell | The host's visible area does not match the layout viewport |

All of that is information only `VisualViewport` can see, and CSS cannot reach. This observer reads it and writes it out as CSS variables.

## The variables it publishes

Written to `document.documentElement` after the call (changeable with `target`):

| Variable | Meaning |
| --- | --- |
| `--adaptive-width` | Visible width (a bare px number, no unit) |
| `--adaptive-height` | Visible height |
| `--adaptive-layout-height` | Layout viewport height, i.e. `window.innerHeight` |
| `--adaptive-keyboard-height` | Estimated visible-height loss at the current zoom; not authoritative keyboard geometry |
| `--adaptive-scale` | The current pinch-zoom factor |
| `--adaptive-vh` | 1% of the visible height, **with a px unit** |
| `--adaptive-vw` | 1% of the visible width, **with a px unit** |

The first five are bare numbers, so using them in arithmetic means adding the unit yourself (`calc(var(--adaptive-keyboard-height) * 1px)`); the last two already carry a unit and can be used directly as replacements for `vh` / `vw`.

## Typical use

A true full-screen height, unaffected by the address bar:

```css
.screen {
  min-block-size: calc(var(--adaptive-vh, 1vh) * 100);
}
```

The `1vh` fallback matters — with the runtime not loaded, or on the SSR first paint, the style still holds.

A bottom action bar that avoids the keyboard:

```css
.action-bar {
  position: fixed;
  inset-block-end: calc(var(--adaptive-keyboard-height, 0) * 1px);
}
```

Pinch zoom also makes `VisualViewport.height` smaller, but it is not a keyboard. The observer divides the layout height by `VisualViewport.scale` before measuring the missing height, so a 2× zoom on an 800px layout (a legitimate 400px visual viewport) reports `0`; a keyboard that then shrinks it to 250px reports `150`. This prevents an ordinary zoom gesture from pushing the action bar halfway up the page.

The `keyboardHeight` name is a convenience, not a keyboard-detection API. The implementation computes `max(0, layoutHeight / scale - visualHeight - offset)`, with `offsetTop` deducted only near scale 1. Other viewport changes can produce the same difference, and a host that resizes both heights together can report zero even with a keyboard open. Validate the action-bar behavior in your target host; do not use this estimate as proof that a keyboard is visible or as its exact bounds.

## Options

```ts
observeAdaptiveViewport({
  prefix: 'adaptive',        // variable prefix, with or without the leading --
  target: document.documentElement,
  window: globalThis.window, // inject for multi-window setups or tests
  document: globalThis.document,
  signal: abortController.signal, // optional automatic teardown
})
```

`prefix` must be a non-empty CSS identifier. A leading `--` is optional and removed; whitespace, an empty string, or a leading digit is rejected before any listener is registered, rather than producing unusable custom-property names.

Every option is optional. Omit `window`, `document` or `target` to use the matching browser global/default element; an explicit `null` is treated as malformed configuration rather than as another spelling of omission. Pass an `AbortSignal` only when a host lifecycle should own cleanup; aborting it is equivalent to calling `destroy()`, and an already-aborted signal creates an inert observer without writing or registering listeners.

For a same-origin iframe or another window, pass its `document` (or an explicit `target`) together with `window`. These defaults are independent: injecting `window` alone does not redirect CSS writes from the current page to that window's document.

```js
const observer = observeAdaptiveViewport({
  window: frameWindow,
  document: frameWindow.document,
})
```

Returns:

```ts
interface AdaptiveViewportObserver {
  update(): AdaptiveViewportSnapshot | null   // trigger a read manually, returns this reading
  destroy(): void                             // remove every listener
}
```

`destroy()` is idempotent and permanent: it cancels a queued animation frame even if the browser returned handle `0`, removes the listeners once, and later `update()` calls return `null` without writing.

### Lifecycle and failures

You can share the host's cancellation signal instead of remembering a separate cleanup call:

```js
const controller = new AbortController()
const observer = observeAdaptiveViewport({ signal: controller.signal })

// When this view is disposed:
controller.abort()
observer.update() // null; create a new observer to start observing again
```

Destroying an observer leaves its last published CSS variables in place; it does not remove or restore styles. If you reuse the target, the next observer publishes a fresh reading. Avoid multiple live observers writing the same prefix to the same target.

Invalid options and failed initial CSS writes throw synchronously. Failed setup attempts to remove its listeners before rethrowing the original error. A later animation-frame write failure automatically destroys the observer; an explicit `update()` failure is thrown to its caller instead. Wrap manual updates in your application's error handling and call `destroy()` when abandoning the observer.

Cleanup is best effort for injected or embedded hosts: if one cancellation or listener-removal method throws, the remaining releases are still attempted without throwing a secondary cleanup error. Callbacks a broken host retains cannot publish after destruction, but the observer cannot guarantee that the host actually released those references.

## SSR

With no `window` the constructor does not throw; the returned observer does nothing and `update()` returns `null`. So it can be called unconditionally at module top level, with no `if (typeof window !== 'undefined')` wrapper.

But the server-rendered first paint will not have these variables, so **write a fallback everywhere you use one**, or the first frame gets an empty value.

## Cost

Viewport events are coalesced through `requestAnimationFrame`; explicit `update()` calls read immediately and are not frame-limited. Viewport listeners are `passive`. Variable names are prepared once per observer, and values are cached individually: unchanged readings perform no DOM writes. A height change writes only the metrics that actually changed, which can include `height`, `layout-height`, `keyboard-height` and `--adaptive-vh`, depending on the host readings. The helper is a separate entry point and is not imported by the main compiler bundle.
