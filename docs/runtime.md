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
| `--adaptive-keyboard-height` | Height obscured by the keyboard, `0` when there is none |
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

## Options

```ts
observeAdaptiveViewport({
  prefix: 'adaptive',        // variable prefix, with or without the leading --
  target: document.documentElement,
  window: globalThis.window, // inject for multi-window setups or tests
  document: globalThis.document,
})
```

Returns:

```ts
interface AdaptiveViewportObserver {
  update(): AdaptiveViewportSnapshot | null   // trigger a read manually, returns this reading
  destroy(): void                             // remove every listener
}
```

## SSR

With no `window` the constructor does not throw; the returned observer does nothing and `update()` returns `null`. So it can be called unconditionally at module top level, with no `if (typeof window !== 'undefined')` wrapper.

But the server-rendered first paint will not have these variables, so **write a fallback everywhere you use one**, or the first frame gets an empty value.

## Cost

Updates are coalesced through `requestAnimationFrame`, so it writes at most once per frame, and every listener is `passive`. Not using it costs nothing — it is a separate entry point and is never pulled into the main bundle.
