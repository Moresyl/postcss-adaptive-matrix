# Build tool integration

**English** · [简体中文](./integration.zh-CN.md)

This is a standard PostCSS 8 plugin, so it works anywhere PostCSS can be configured. Below is how to wire it into each tool, plus a few places where things go wrong silently.

## Vite

`postcss.config.mjs` (recommended — it keeps this out of `vite.config.ts`):

```js
import adaptiveMatrix, { appPcPreset } from 'postcss-adaptive-matrix'
import autoprefixer from 'autoprefixer'

export default {
  plugins: [
    adaptiveMatrix(appPcPreset({ rootSelector: '#app' })),
    autoprefixer(),
  ],
}
```

Or inside `vite.config.ts`:

```ts
export default defineConfig({
  css: {
    postcss: {
      plugins: [adaptiveMatrix(appPcPreset({ rootSelector: '#app' }))],
    },
  },
})
```

**Not both.** As soon as Vite sees `css.postcss` as an inline object it stops reading `postcss.config.*`.

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  postcss: {
    plugins: {
      'postcss-adaptive-matrix': { /* options */ },
      autoprefixer: {},
    },
  },
})
```

Nuxt uses the object form, keyed by package name. To use `appPcPreset` you have to go back to the array form in `postcss.config.mjs` — a preset returns an object, which cannot be expressed as a package-name key.

## Webpack

```js
// postcss.config.js
module.exports = {
  plugins: [
    require('postcss-adaptive-matrix')(require('postcss-adaptive-matrix').appPcPreset()),
    require('autoprefixer'),
  ],
}
```

`postcss-loader` goes after `css-loader` and before any preprocessor loader:

```js
use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader']
```

## Taro

```js
// config/index.js
const config = {
  mini: { postcss: { /* Taro's own plugin configuration */ } },
  h5: {
    postcss: {
      'postcss-adaptive-matrix': {
        enable: true,
        config: { defaultProfile: 'app', profiles: { /* ... */ } },
      },
    },
  },
}
```

On the mini-program side, use a single canvas: mini programs have no `@media`, so `query: false` is mandatory, and `rpx` is already doing something similar — stacking two conversions doubles the effect.

---

## Four ways to fail silently

### 1. Plugin order

Put it **before** `autoprefixer`. `autoprefixer` does not prefix `clamp()`, so the wrong order is not an error — it is just a wasted pass.

Putting it **after** a nesting plugin such as `postcss-nesting` is fine too — both orders are correct, because a nested `@adaptive` is now handled properly (see [Architecture](./architecture.md#nesting)).

Sass and Less are not part of this discussion: a preprocessor finishes before PostCSS starts, so PostCSS already receives expanded CSS.

### 2. `from` is mandatory

Everything that decides a canvas by file path — the `file` channel in `routes`, `include` / `exclude`, and component-library path matching — depends on PostCSS's `from`.

Vite, Webpack, Nuxt and Taro all pass it. But if you hand-write `postcss(...).process(css)` without `from`, the file path degrades to an empty string and every `file` match silently stops working — no error, the component libraries simply stop being claimed.

```js
// wrong
await postcss([adaptiveMatrix(options)]).process(css)

// right
await postcss([adaptiveMatrix(options)]).process(css, { from: '/abs/path/app.css' })
```

### 3. A Vue SFC path carries a query string

The `from` Vite gives a `<style>` block looks like this:

```
/project/src/views/mobile/home/index.vue?vue&type=style&index=0&lang.scss
```

Write `file` patterns as **contains**, not anchored to the end:

```js
routes: [{ profile: 'mobile', file: [/[\\/]mobile[\\/]/] }]   // right
routes: [{ profile: 'mobile', file: [/\.mobile\.scss$/] }]     // never matches an SFC
```

Windows and POSIX use different separators, hence `[\\/]` rather than `/`.

### 4. The root foundation is repeated per file in a component-based project

Once `rootSelector` / `root` is configured, the plugin appends a global foundation. It is global, but PostCSS only ever sees one file at a time and has no way to deduplicate across files — so by default **every file gets a copy**.

In Vue and Svelte every component's `<style>` block is a separate file, so 150 components mean 150 copies of the safe-area variables and root column rules. Not an error, just a needlessly larger bundle.

```js
appPcPreset({
  rootSelector: '#app',
  rootInjectTo: 'src/styles/main',   // inject only into the entry
})
```

Conversely, a pattern that matches nothing injects nothing, also without an error. Run `npx adaptive-matrix src/styles/main.css` to confirm the added declarations appear in the entry file.

---

## Atomic CSS: Tailwind and UnoCSS

Utility CSS goes through PostCSS too, so it gets converted too — which is what you want: `p-4` and a hand-written `padding: 16px` mean the same size and should produce the same result.

**But the default configuration reads none of it, and says nothing.** Install the plugin, run a build, and your hand-written CSS scales while the utilities stay put; from then on the two size systems drift. There are two reasons, depending on which major version you use.

One wrapper solves both:

```js
import adaptiveMatrix, { appPcPreset, withAtomicCss } from 'postcss-adaptive-matrix'

export default {
  plugins: [adaptiveMatrix(withAtomicCss(appPcPreset({ rootSelector: '#app' })))],
}
```

`withAtomicCss` **wraps** rather than replaces: your existing `profiles`, `routes` and `root` are all kept, and it only adds the two things needed. Here is what each of those two is unblocking.

### Obstacle one: the unit is rem

Tailwind 3 and UnoCSS `presetUno` / `presetWind3` write lengths directly in `rem`:

```css
.p-4      { padding: 1rem }          /* not 16px */
.text-lg  { font-size: 1.125rem; line-height: 1.75rem }
.border   { border-width: 1px }      /* borders are still px */
.p-\[13px\] { padding: 13px }        /* bracketed arbitrary values are px too */
```

Both units appear in the same stylesheet. So what you need to read is **both**, not `rem` instead of `px`: reading only `rem` misses every border width and bracketed value, and reading only `px` misses spacing and font sizes. The first thing `withAtomicCss` does is add `rem` to `unitToConvert`.

If your page sets `html { font-size: 62.5% }`, add `rootValue: 10` so the reading and writing ends change together — see [Configuration reference](./configuration.md#unittoconvert-and-rootvalue).

### Obstacle two: the length is not in the utility at all

Tailwind 4 and UnoCSS `presetWind4` changed shape — there is no length in the utility, only a variable reference:

```css
:root { --spacing: 0.25rem; --text-lg: 1.125rem; --radius-lg: 0.5rem }

.p-4       { padding: calc(var(--spacing) * 4) }
.gap-8     { gap: calc(var(--spacing) * 8) }
.rounded-lg{ border-radius: var(--radius-lg) }
.text-lg   { font-size: var(--text-lg) }
```

`var()` is opaque; the compiler cannot see through it. So the theme tokens have to be claimed **at the source**. Custom properties are not converted by default (they must be explicitly claimed, or `transformCustomProperties` enabled), and the route `withAtomicCss` adds is exactly that claim.

Once the tokens are claimed, the utilities are correct without being touched:

```css
--spacing: clamp(3.41333px, 1.06667vw, 5.12px);
.p-4 { padding: calc(var(--spacing) * 4) }
```

`calc(clamp(a, b, c) * 4)` is equivalent to `clamp(4a, 4b, 4c)` (multiplication by a positive coefficient passes through a clamp), and the result is digit-for-digit identical to converting `16px` directly.

The claimed token prefixes are `--spacing`, `--text-`, `--leading-`, `--radius-`, `--container-`. Three are **deliberately absent**:

| Not claimed | Why |
| --- | --- |
| `--breakpoint-*` | It is the width at which a canvas **switches**. Scaling it moves the breakpoint itself, and nothing anywhere would say so |
| `--tracking-*` | Published in `em`, and the font size the `em` hangs off is already fluid — scaling again compounds it |
| `--shadow-*` | A shadow's pixels are depth drawn at screen scale, not a length measured on a design file |

Length families you extend the theme with are added via `tokenPrefixes`:

```js
withAtomicCss(appPcPreset(), { tokenPrefixes: ['--gutter-', '--size-'] })
```

### Font-size tokens stay zoomable

A name like `--text-lg` does not look like a font property, but a font size is exactly what it carries. The default `textProperties` includes `--text-*` and `--leading-*`, so it gets precisely the same `rem + vw` hybrid as a hand-written `font-size`, and browser text zoom is unaffected:

```css
--text-lg: clamp(1.06725rem, calc(0.73125rem + 1.68vw), 1.23525rem);
```

This does nothing for an unclaimed token — it decides **how** an already-converting length is written, not whether it converts.

### This section was written against real output

The three cases under `conformance/cases/atomic/` take their input from the **actual published output** of Tailwind CSS 4.3.3, UnoCSS 66.7.5 `presetWind3` and UnoCSS 66.7.5 `presetWind4` — not hand-written imitations, because the two shapes above differ far too much for a hand-written copy to be anything but what you imagined. Re-capture with `scripts/capture-atomic.mjs`.

Neither framework is a devDependency: the captured CSS is the entire input, and tying `npm test` to someone else's release schedule buys no extra information.

### The other route

If you would rather not configure anything, make the framework emit px instead: UnoCSS has `@unocss/preset-rem-to-px`, and Tailwind 3 has `theme.spacing`. Tailwind 4 has no such route — its shape is token indirection, which has nothing to do with units.

### Which canvas utilities use

Utilities have no distinguishing class-name prefix, so they use `defaultProfile`. To send a group of utilities to another canvas, use the `selector` channel in `routes`; to move the theme tokens as a whole, use `withAtomicCss(base, { profile: 'pc' })`.

## On-demand component imports

On-demand importers such as `unplugin-vue-components` still end up importing CSS files from `node_modules`, so the path channel matches as usual and no extra configuration is needed.

But do **not** add `exclude: [/node_modules/]` for "performance" — that excludes the component libraries' CSS entirely, so the components fall back to raw pixels and stop lining up with your scaled page. That is precisely the problem [Component libraries](./libraries.md) exists to solve.

## Verifying

After changing configuration, running the output is more reliable than reading the configuration:

```bash
npx adaptive-matrix src/styles/app.css -c postcss.config.mjs
```

The output is a per-declaration before/after, with no build to start and no browser to open. The "`from` is mandatory" trap above can also be rehearsed with `--from` before you ship. See [CLI preview](./cli.md).

## This page was run against a real build

Every claim on this page about Vite is verified by a **real Vite build** in `test/vite.test.ts`, rather than simulated with `postcss().process`. The scaffold includes an auto-discovered `postcss.config.mjs`, a dependency stylesheet imported from `node_modules`, and a `<style>` block supplied the same way `@vitejs/plugin-vue` supplies one. It then asserts that:

- Vite really does find and apply the config file (when it does not, the build still succeeds and the stylesheet passes through untouched, with nothing anywhere saying so);
- dependency CSS lands on the component-library canvas via its `node_modules` path, producing output **byte-for-byte identical** to the equivalent size on the page;
- an SFC id with a query string is matched by a contains-style `file` route;
- building the same input twice produces identical output (watch and HMR run the same pipeline over and over);
- conversely, an end-anchored pattern like `/\.mobile\.css$/` really does leave the SFC block silently on the default canvas — point 3 above, turned from something remembered into something verified.

There is no real Webpack build. All `postcss-loader` does is call `postcss.process` with a `from`, and what has actually broken in a Webpack setting is whether the CommonJS entry can be called directly (fixed in 0.4.0), which `test/package.test.ts` verifies against the built artifact itself. Pulling in a whole Webpack toolchain for a path with almost no independent risk is not worth it.
