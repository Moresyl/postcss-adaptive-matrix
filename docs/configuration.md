# Configuration reference

**English** · [简体中文](./configuration.zh-CN.md)

Every option, its type and its default. If you are just starting, read [Getting started](./getting-started.md) first.

## Top-level options

| Option | Default | Meaning |
| --- | --- | --- |
| `profiles` | app/desktop preset | The map of design canvases |
| `defaultProfile` | `app` | The canvas ordinary CSS uses |
| `routes` | `[]` | Reassign a canvas by selector, property name or file |
| `libraries` | `'auto'` | Component-library adaptation; all built-ins on by default |
| `atRuleName` | `adaptive` | Custom at-rule name |
| `strategy` | `clamp` | `clamp`, or the compatibility-oriented `viewport` |
| `unit` | `vw` | `vw`, `vi`, `cqw`, `cqi` |
| `precision` | `5` | 0–12 decimal places |
| `unitToConvert` | `'px'` | The input unit(s) to read; an array reads several |
| `rootValue` | `16` | How many pixels one `rem` is worth |
| `minPixelValue` | `0` | Absolute values below this are not converted |
| `hairline` | `1` | Hairline threshold that is never converted |
| `fontFluidity` | `0.35` | Text fluidity ratio, 0–1 |
| `textProperties` | font-related properties | Properties that use the zoomable hybrid formula |
| `propList` | `['*']` | Property list supporting `*` and `!` |
| `selectorExclude` | `[]` | Exclude by substring or regular expression |
| `valueExclude` | `[]` | Exclude by value |
| `include` / `exclude` | none | File string, regular expression, function, or an array |
| `transformCustomProperties` | `false` | Whether to convert `--token` values |
| `preserveOriginal` | `false` | Keep the original declaration in front as a fallback |
| `root` | `false` | The optional root layout foundation |
| `unknownProfile` | `warn` | `warn`, `error`, `ignore` |

`propList` example:

```js
propList: ['*', '!border*', '!box-shadow']
```

The `*` is not optional. An exclude-only `['!border*']` matches no property at all, which means the entire stylesheet goes unconverted — that configuration is an error rather than a silent no-op.

### Configuration is always validated first

A configuration usually lives in a `.mjs` file with no type checking behind it, and getting these fields wrong fails **silently**. So all of the following are errors raised before the first stylesheet is read:

| What you wrote | The consequence |
| --- | --- |
| `unit: 'vm'` | Emits `4.267vm`. That is not a length, so the browser drops the whole declaration and the element keeps its inherited value |
| `strategy: 'viewpoint'` | Silently falls back to `clamp`, looking exactly like a setting that took effect |
| `unitToConvert: ''` / `[]` | Matches no length, indistinguishable from not installing the plugin |
| `rootValue: 0` | Every `rem` reads as 0, and the writing end divides by zero |
| `atRuleName: 'media'` | Every `@media` in the stylesheet is read as a canvas name and rewritten. At-keywords are case-insensitive, so `MEDIA` is the same collision |
| `root.selector: ''` | Compiles to `:where()`, which is a parse error — the whole foundation, safe-area variables included, is discarded |
| `textAnchorWidth: 0` | Division by zero, turning every text length into `Infinity` |

`unit` and `strategy` are validated at profile level too.

### unknownProfile

When the canvas name in `@adaptive ghost` does not exist:

| Value | Behaviour |
| --- | --- |
| `warn` | Warn, and leave the at-rule as written |
| `error` | Fail the build |
| `ignore` | Say nothing, and leave the at-rule as written |

Both `warn` and `ignore` leave the original text, and a browser that cannot read `@adaptive` **discards the whole block** — everything inside it disappears. The only difference is whether anyone told you. Canvas names are case-sensitive (they are keys you wrote in `profiles`), so `@adaptive PC` does not find `pc`.

A block-less `@adaptive pc;` warns separately: with no block, nothing is compiled onto that canvas, and it is not rewritten into a `@media`.

### unitToConvert and rootValue

```ts
unitToConvert?: string | readonly string[]   // default 'px'
rootValue?: number                           // default 16
```

By default only `px` is read. An array reads several units at once, which atomic CSS projects need — see [Build tool integration](./integration.md#atomic-css-tailwind-and-unocss):

```js
unitToConvert: ['px', 'rem']
```

There is exactly one conversion rule between units: **`rem` becomes pixels via `rootValue`; every other unit is read at face value.**

`em` is read at face value too, deliberately. `em` is relative to the font size an element inherits, which is only known at runtime, and no build-time constant can stand in for it. Treating `em` as `rem` is correct only where the two happen to be equal — a minority of places in any stylesheet.

`rootValue` governs both ends:

- when reading, how many pixels `1rem` is worth;
- when writing, what the static part of a text size is divided by to become `rem`.

So a page with `html { font-size: 62.5% }` sets `rootValue: 10`, and `3.2rem` and `32px` produce exactly the same output, both correct. Configuring only one end would be wrong at the other, which is why there is no second option here.

The `minPixelValue` and `hairline` thresholds are in **pixels**, not face value. A framework writing a hairline as `0.0625rem` and you writing `1px` are the same line, and `hairline` stops both.

## AdaptiveRoute

```ts
interface AdaptiveRoute {
  profile: string | false
  file?: FileMatcher | FileMatcher[]
  selector?: (string | RegExp) | (string | RegExp)[]
  property?: string | string[]
}
```

Reassigns matching CSS to another canvas; `profile: false` keeps the pixels unconverted. Strings match by "contains" and regular expressions by `test`; `property` matches custom property names by prefix.

Every channel a route declares must match. To let a class name and a file match independently, write two routes.

Splitting two non-responsive ends by directory is the most common use:

```js
adaptiveMatrix({
  defaultProfile: 'pc',
  profiles: {
    pc:     { designWidth: 1920, fluid: { minWidth: 1280, maxWidth: 2560 } },
    mobile: { designWidth: 750,  fluid: { minWidth: 320,  maxWidth: 600  } },
  },
  routes: [{ profile: 'mobile', file: [/[\\/]mobile[\\/]/] }],
})
```

Both canvases are resolved inside the same plugin instance, so they cannot overwrite each other and you do not need to register the plugin once per end — a piece of CSS is converted exactly once, and the first canvas that matches is the final answer.

Resolution priority, highest first:

1. an enclosing `@adaptive <profile>` — the author has already said so;
2. a matching `property` route;
3. a matching `selector` route;
4. a matching `file` route;
5. `defaultProfile`.

A selector beats a file path because the selector is part of the CSS itself, whereas a path only reflects how the build tool happened to arrange files at the time; once a bundler inlines a dependency, the path is gone. The reasoning for property names is the same and stronger: theme tokens are declared on `:root` and leave no trace of their origin beyond their name.

## libraries

```ts
type LibraryEntry =
  | string                                              // a built-in name
  | LibraryAdaptation                                   // a complete definition
  | (Partial<LibraryAdaptation> & { extends: string })  // adjust a built-in

libraries?: LibraryEntry[] | 'auto' | false
```

Default `'auto'`: every built-in is active, so a project using Vant or Element Plus needs no configuration. `false` turns the whole thing off. Providing an array enables only the listed entries.

Entries expand into routes appended after `routes` — explicit routes always win.

For the built-in list, the matching channels and how to override or extend, see [Component libraries](./libraries.md).

## Profile

```ts
interface AdaptiveProfile {
  designWidth: number | ((context: { file: string; profile: string }) => number)
  fluid: { minWidth: number; maxWidth: number }
  query?: string | {
    type?: 'media' | 'container'
    condition: string
    name?: string
  } | false
  unit?: 'vw' | 'vi' | 'cqw' | 'cqi'
  strategy?: 'clamp' | 'viewport'
  fontFluidity?: number
  textAnchorWidth?: number | ((context: { file: string; profile: string }) => number)
  rootMaxWidth?: number
}
```

`query: false` removes the `@adaptive` wrapper but keeps the rules inside it, which suits building separate artifacts with the profile chosen by environment.

`textAnchorWidth` defaults to `designWidth` and affects text only: text keeps a fixed `rem` component (so browser zoom keeps working), and a fixed length only means something relative to some width. A hand-written canvas anchoring to its own design width is correct; but when two canvases describe **the same design in two sets of units** (a library drawn on 375, pages drawn on 750, where Vant's 16px is the page's 32px), anchoring each to itself leaves the two misaligned at every viewport. Library canvases therefore always inherit the anchor of the profile they belong to, with nothing to configure. For the reasoning and the measurements see [Which canvas the static part anchors to](./architecture.md#which-canvas-the-static-part-anchors-to).

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector: string
  center?: boolean
  container?: boolean
  containerName?: string
  safeAreaVariables?: boolean
  layer?: string | false
  logical?: boolean
  fixedContainingBlock?: boolean
  injectTo?: FileMatcher | FileMatcher[]
}
```

No global styles are injected by default. This is enabled only by configuring `root` explicitly or passing `rootSelector` to `appPcPreset`.

### injectTo

Limits which files receive the foundation; by default, all of them.

The foundation is global, but PostCSS only ever sees one file at a time and cannot deduplicate across files. A single-stylesheet project wants the default; in a Vue or Svelte project every component's `<style>` block is a separate file, so the default becomes one copy per component.

```js
root: { selector: '#app', injectTo: 'src/styles/main' }
```

Matching works exactly like `include`: a string matches by "contains", a regular expression tests the path, and a function decides for itself. The `appPcPreset` field is `rootInjectTo`.

A pattern that matches nothing is not an error — it just injects nothing. Use the [CLI preview](./cli.md) to confirm the added declarations appear in the entry file.

### logical

Default `true`: the foundation is written with logical properties — `inline-size`, `margin-inline`, `max-inline-size`.

Set it to `false` and it writes `width`, `margin-left` / `margin-right` and `max-width` instead. The two are equivalent on a horizontal page, so this switch has exactly one purpose: **a fallback for browsers that cannot read logical properties** (below Safari 15 / iOS 15.0 / Chrome 89).

It deserves its own switch because it is the only syntax this plugin emits whose failure still leaves a page that looks fine: without `margin-inline: auto` the column is exactly the right width and sits against the left edge of the screen; without `max-inline-size` it goes full-bleed. Neither looks like a fault. For the complete failure list and the degradation path for each, see [Browser support and degradation](./compatibility.md).

The `appPcPreset` field is `rootLogical`; likewise `rootLayer`, which passes through to `layer`.

### fixedContainingBlock

When a profile sets `rootMaxWidth`, the page becomes a centred column, and `position: fixed` falls back to the viewport as its containing block — the fixed element sticks to the window edges, out of line with the content column it belongs to.

Enabled, the compiler publishes two variables:

| Variable | Meaning |
| --- | --- |
| `--adaptive-root-width` | The root column width at the current breakpoint, or `100vw` with no ceiling |
| `--adaptive-root-gutter` | `max(0px, (100vw - column width) / 2)`, i.e. the gutter on one side |

and does three things to rules that themselves declare `position: fixed`:

- `left` / `right` / `inset-inline-*` become the gutter when they are `0`, and `calc(original + gutter)` when they are not; `auto` is left alone;
- `width` / `inline-size` and friends become `min(100%, column width)` when they are `100%`;
- the block axis (`top` / `bottom`) is untouched — a centred column only constrains the inline axis.

When the column equals the viewport, the gutter is `0`, so narrow-screen output is identical to what you would have written by hand. The correction is idempotent and does not reprocess a value that already contains these variables.

Only the rule's own `position` declaration is considered: inheriting positioning from elsewhere is not something CSS allows you to observe statically, and guessing would be worse than missing.

It is on by default when `appPcPreset` is given a `rootSelector` — both of that preset's profiles set `rootMaxWidth`, which is exactly the configuration where the problem appears. Turn it off with `appPcPreset({ rootSelector: '#app', fixedContainingBlock: false })`.

## Legacy WebView mode

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',
  preserveOriginal: true,
})
```

This emits the original `px` followed by the `vw`. Whether to use it should be decided by your real target browsers; modern projects should prefer the default `clamp`.

"Real target browsers" does not have to be a guess — `npx adaptive-matrix src/app.css --targets "ios_saf 13, chrome 90"` lists every piece of syntax in the output beyond your targets, along with what is lost when it is unsupported and the switch that turns it off. See [Browser support and degradation](./compatibility.md).
