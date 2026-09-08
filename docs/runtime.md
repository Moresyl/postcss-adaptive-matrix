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

## SSR

With no `window` the constructor does not throw; the returned observer does nothing and `update()` returns `null`. So it can be called unconditionally at module top level, with no `if (typeof window !== 'undefined')` wrapper.

But the server-rendered first paint will not have these variables, so **write a fallback everywhere you use one**, or the first frame gets an empty value.

## Cost

Updates are coalesced through `requestAnimationFrame`, so it reads at most once per frame, and every listener is `passive`. Values are cached individually: a noisy resize event whose viewport did not actually change performs no DOM writes, while a height-only change updates only height, keyboard height and `--adaptive-vh`. Not using it costs nothing — it is a separate entry point and is never pulled into the main bundle.
