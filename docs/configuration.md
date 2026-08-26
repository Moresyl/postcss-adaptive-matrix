# Configuration reference

**English** · [简体中文](./configuration.zh-CN.md)

Every option, its type and its default. If you are just starting, read [Getting started](./getting-started.md) first.

## Top-level options

| Option | Default | Meaning |
| --- | --- | --- |
| `profiles` | app/desktop preset | The map of design canvases |
| `defaultProfile` | `app` | The canvas ordinary CSS uses |
| `routes` | `[]` | Reassign a canvas by selector, property name, breakpoint or file |
| `libraries` | `'auto'` | Component-library adaptation; all built-ins on by default |
| `atRuleName` | `adaptive` | Custom at-rule name |
| `strategy` | `clamp` | `clamp`, or the compatibility-oriented `viewport` |
| `unit` | `vw` | `vw`, `vi`, `cqw`, `cqi` |
| `precision` | `5` | 0–12 decimal places |
| `unitToConvert` | `['px']` | The input unit(s) to read; a single string is accepted too |
| `rootValue` | `16` | How many pixels one `rem` is worth; a function may choose it per file |
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

Most configurations require no user-supplied fields because the built-in preset fills the top level. An empty `profiles: {}` is therefore equivalent to omitting it, which keeps conditionally assembled configuration information-free. A profile with no overrides can be just its width — `profiles: { mobile: 375 }`; use `{ designWidth: 375, ... }` only when it also needs `fluid`, `query`, `unit`, or another override. Once you explicitly author a nested object, only values that define its identity or calculation are required: `profile.designWidth`, an object-form `query.condition`, a route's `profile` plus at least one matching channel, and a standalone custom library's `name` plus `designWidth` (an `extends` entry inherits them). `fluid` and `root` have no required members. Optional top-level fields set to `undefined` by object composition are treated exactly like omission; `null` remains an error rather than silently selecting a default. A sole custom profile also becomes `defaultProfile` automatically; with several custom profiles and no `app`, name the default because there is no unambiguous choice.

String file matchers are separator-portable: `src/components/` also matches `C:\\repo\\src\\components\\card.css`, and a backslash spelling also matches a POSIX path. Regular expressions and predicate functions receive the original path unchanged, so existing host-specific logic keeps its exact contract.

List-shaped filters accept one item directly. `propList: 'width'`, `textProperties: 'font-size'`, `selectorExclude: '.legacy'`, and `valueExclude: /fixed/` are equivalent to one-element arrays; arrays are needed only for multiple entries.

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
| `atRuleName: ' canvas '` | Normalised to `canvas`; otherwise validation would pass while no `@canvas` block ever matched |
| `fontFluidity: NaN` / `rootMaxWidth: Infinity` | Writes `NaNrem` or `Infinitypx`; the declaration is invalid and the browser drops it |
| `query: { type: 'media' }` | Writes `@media undefined`, an invalid wrapper around otherwise valid rules |
| `propList: 16` | A JavaScript/JSON shape error that would otherwise escape later as an internal `.every is not a function` |
| `minPixeValue: 2` | An unknown field that would otherwise be spread into the options and ignored; the error suggests `minPixelValue` |
| `root.selector: ''` | Compiles to `:where()`, which is a parse error — the whole foundation, safe-area variables included, is discarded |
| `textAnchorWidth: 0` | Division by zero, turning every text length into `Infinity` |

`unit` and `strategy` are validated at profile level too. Collection members and nested route, query, root, and library fields are checked with their full path (for example `routes[0].media[1].minWidth`), so JavaScript configs receive the same early protection as JSON files backed by the published schema.

Objects are closed at every level, just like the schema's `additionalProperties: false`: a misspelled top-level option or a field inside `profiles`, `fluid`, `query`, `routes`, `media`, `root`, or `libraries` is never silently ignored. When an unambiguous field is within two edits (three for a long name), the error names it; unrelated keys are rejected without inventing a guess.

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
rootValue?: number | ((context: { file: string }) => number) // default 16
```

By default only `px` is read. An array reads several units at once, which atomic CSS projects need — see [Build tool integration](./integration.md#atomic-css-tailwind-and-unocss):

```js
unitToConvert: ['px', 'rem']
```

The current profile's output unit is always treated as already converted, even if it also appears in `unitToConvert`. This lets compatibility-mode bare `vw` survive another build. Other pairs remain meaningful: a profile emitting `cqi` may still read authored `vw` when explicitly configured to do so.

There is exactly one conversion rule between units: **`rem` becomes pixels via `rootValue`; every other unit is read at face value.**

Every listed unit must be an unescaped CSS identifier (`px`, `rem`, `rpx`, `dp`, etc.). A percentage is not a unit token, and punctuation or whitespace cannot occur inside one; values such as `%`, `px|rem`, or `two words` are rejected instead of being compiled into a misleading regular expression.

`em` is read at face value too, deliberately. `em` is relative to the font size an element inherits, which is only known at runtime, and no build-time constant can stand in for it. Treating `em` as `rem` is correct only where the two happen to be equal — a minority of places in any stylesheet.

`rootValue` governs both ends:

- when reading, how many pixels `1rem` is worth;
- when writing, what the static part of a text size is divided by to become `rem`.

So a page with `html { font-size: 62.5% }` sets `rootValue: 10`, and `3.2rem` and `32px` produce exactly the same output, both correct. Configuring only one end would be wrong at the other, which is why there is no second option here.

`rootValue` is optional. When different sub-apps in one repository set different root font sizes, use a function and let the source path choose the ruler once for that file:

```js
rootValue: ({ file }) => file.replaceAll('\\', '/').includes('/legacy/') ? 10 : 16
```

The callback receives `{ file }` with the host's original path separators and must return a positive finite number. A real PostCSS `from` path is required for a file-sensitive choice; without one the stylesheet still compiles, but emits one warning because the callback cannot distinguish files.

The `minPixelValue` and `hairline` thresholds are in **pixels**, not face value. A framework writing a hairline as `0.0625rem` and you writing `1px` are the same line, and `hairline` stops both.

## AdaptiveRoute

One route object can be passed directly; use an array only when order between multiple routes matters. Internally both forms become the same ordered list.

```ts
interface AdaptiveRoute {
  profile: string | false
  file?: FileMatcher | FileMatcher[]
  selector?: (string | RegExp) | (string | RegExp)[]
  property?: string | string[]
  media?: MediaMatcher | MediaMatcher[]
}

interface MediaMatcher {
  minWidth?: number
  maxWidth?: number
}
```

Reassigns matching CSS to another canvas; `profile: false` keeps the pixels unconverted. Strings match by "contains" and regular expressions by `test`; `property` accepts unescaped custom-property prefixes beginning with `--`, matches them case-sensitively, and may use bare `--` to claim every custom property; `media` matches the widths an enclosing `@media` confines the rule to — see [Breakpoints](#breakpoints).

Standard declaration names and `propList` patterns are ASCII case-insensitive, as CSS requires: `FONT-SIZE` is still text and keeps the zoomable `rem + vw` formula. Custom properties are the opposite: `--Theme-gap` and `--theme-gap` are different variables, so filters and routes preserve their spelling.

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
4. a matching `media` route;
5. a matching `file` route;
6. `defaultProfile`.

A selector beats a file path because the selector is part of the CSS itself, whereas a path only reflects how the build tool happened to arrange files at the time; once a bundler inlines a dependency, the path is gone. The reasoning for property names is the same and stronger: theme tokens are declared on `:root` and leave no trace of their origin beyond their name.

A selector beats a width band for a different reason: a component library is drawn on its own canvas at every viewport width, and a breakpoint does not change which design file the component came from. To override a library's own component *at* a breakpoint, say both — see below.

## Breakpoints

A responsive stylesheet is one file holding two design files. The phone numbers were measured on a 750 mock; the numbers inside `@media (min-width: 1024px)` were measured on a 1440 one. Nothing in the CSS says so, and compiling the whole file against one canvas is not a near miss:

```css
/* defaultProfile 'app': designWidth 750, fluid 320–600 */
@media (min-width: 1024px) {
  .hero { padding: 40px }        /* → clamp(17.07px, 5.33vw, 32px) */
}
```

That rule is only ever live from 1024px up, which is past where the phone canvas stops scaling — so the `clamp()` is already pinned to its maximum everywhere the rule applies. The padding is a constant 32px at every width, forever. The compiler ran, the output looks compiled, and not one value moves.

A `media` route gives the breakpoint the design file it was drawn on:

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750,  fluid: { minWidth: 320,  maxWidth: 600  } },
    pc:  { designWidth: 1440, fluid: { minWidth: 1024, maxWidth: 1920 } },
  },
  routes: [{ media: { minWidth: 1024 }, profile: 'pc' }],
})
// .hero → clamp(28.44px, 2.78vw, 53.33px)
```

Matching is by **implication, not by text**. `{ minWidth: 1024 }` claims any rule that cannot apply below 1024px, so it matches all of these:

| Query | Band it is live in | Claimed |
| --- | --- | --- |
| `(min-width: 1024px)` | 1024px and up | yes |
| `screen and (min-width: 1200px)` | 1200px and up | yes |
| `(min-width: 64rem)` | 1024px and up | yes |
| `(min-width: 1024px) and (max-width: 1600px)` | 1024–1600px | yes |
| `(min-width: 1024px) and (orientation: landscape)` | 1024px and up (landscape only) | yes |
| `(min-width: 768px)` | 768px and up | no — it reaches below 1024 |

Nesting is conjunction, so `@media (min-width: 900px) { @media (min-width: 1100px) { … } }` is live from 1100px up and is claimed.

`rem` and `em` resolve at **16px**, not at `rootValue` and not at the root element's font size. A media query is evaluated before any declaration could change `font-size`, so it cannot depend on the cascade it selects — `64rem` is 1024px even in a stylesheet whose `html` is `62.5%`. Utility frameworks write every breakpoint this way.

Width numbers use the same complete CSS grammar as declarations: signs, fractions and exponents are accepted, so `(MIN-WIDTH: 1.024e3PX)` is the same 1024px boundary. Feature names and units are ASCII case-insensitive. Unitless `0` is valid; any other unitless width, a malformed decimal, or a non-finite exponent makes the query unreadable rather than leaking `NaN` into routing and diagnostics.

A query the compiler cannot read — a comma, `not`, `only`, or an unsupported non-width feature — is claimed by **nothing**. Orientation is the deliberate exception: `(orientation: landscape)` / `portrait` is projected out while deriving the width band, because it can narrow which devices apply but can never make a 1024px minimum reach below 1024px. An orientation-only query therefore keeps the inherited canvas, while `orientation + min-width` can still prove a width route. Continuity analysis remains conservative and skips the group because it cannot guess the device's current orientation. `@container` never counts either; it bounds an element, and `vw` has never been about the element.

Contradictory readable bounds are different from an unreadable query. They form an empty interval, so no media route claims it and a converted rule gets one explicit `unreachable` warning (`min-width: 1100px` together with `max-width: 900px`). This is not reported as a pinned clamp: there is no viewport at which the rule exists. `--fail-on warnings` can enforce it in CI.

To redraw a component library's own component at a breakpoint, name both — a selector route on its own would apply at every width, and a width band on its own loses to the library:

```js
routes: [{ selector: ['.van-'], media: { minWidth: 1024 }, profile: 'pc' }]
```

### The warning you get for free

You do not have to know about any of this to find the problem. When a rule generates a bounded length and its band lies entirely outside its canvas's fluid range, the compiler says so:

```
Every converted length here is a constant: this rule is live from 1024px up, but canvas
"app" stops scaling outside 320px–600px, so its bounded expression is pinned to its maximum across
that whole range. The numbers in a breakpoint are usually measured on a different design
file — give it one with a route: { media: { minWidth: 1024 }, profile: '…' }.
```

This is arithmetic, not a heuristic: two numbers that do not overlap. It is reported once per canvas per band per file, and only for declarations whose conversion generated `clamp()`, `min()` or `max()` — a breakpoint that only changes `display` and `color`, deliberately static text, and an unbounded viewport expression have no generated bounds to pin. Selector- and property-routed declarations are checked against the canvas that actually converted them, including native CSS nesting.

## libraries

```ts
type LibraryEntry = string | LibraryAdaptation

libraries?: LibraryEntry | readonly LibraryEntry[] | false // string 'auto' is the default
```

Default `'auto'`: every built-in is active, so a project using Vant or Element Plus needs no configuration. `false` turns the whole thing off. Pass one built-in or custom entry directly; use an array only when enabling more than one.

An inherited adaptation can be as small as `{ extends: 'vant' }`; it receives `name` and `designWidth` from the built-in. A standalone custom adaptation still requires both because there is nowhere to infer them from.

Entries expand into routes appended after `routes` — explicit routes always win.

For the built-in list, the matching channels and how to override or extend, see [Component libraries](./libraries.md).

## Profile

Use a number directly for a width-only profile. A file-sensitive design width resolver can also be the direct value. The object form is needed only for per-profile overrides:

```js
profiles: {
  mobile: 375,
  desktop: { designWidth: 1440, unit: 'vi' },
  embedded: ({ file }) => file.includes('/compact/') ? 320 : 375,
}
```

```ts
interface AdaptiveProfile {
  designWidth: number | ((context: { file: string; profile: string }) => number)
  fluid?: { minWidth?: number; maxWidth?: number }
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

Only `designWidth` is required in a profile. Omit `fluid` (or use `fluid: {}`) for an unbounded viewport expression, provide `minWidth` or `maxWidth` for a one-sided `max()`/`min()` limit, and provide both for `clamp()`. Supplied bounds must be positive finite numbers; when both exist, `maxWidth` must be greater than `minWidth`. The explicit `strategy: 'viewport'` compatibility mode remains unbounded regardless of `fluid`.

Function-valued widths receive `{ file, profile }`. A missing `textAnchorWidth` reuses the already-resolved `designWidth` exactly once rather than calling a dynamic resolver again. File-sensitive resolvers need a real PostCSS `from` path; an invalid return reports both profile and file.

`query: false` removes the `@adaptive` wrapper but keeps the rules inside it, which suits building separate artifacts with the profile chosen by environment.

An object query defaults to media when it has no `type`. Providing `name` is enough to select a named container query, so `{ name: 'workspace', condition: '(min-width: 400px)' }` needs no redundant `type: 'container'`. An explicit `type: 'media'` together with `name` is rejected as a conflict.

Query conditions may use current or future CSS media/container-query syntax, but their structural boundary must be complete: strings, comments and `()` / `[]` component-value blocks must close, while an unescaped brace or top-level `;` is rejected. This prevents a JavaScript configuration typo from ending the generated at-rule early or swallowing the rules that follow it without artificially freezing the query grammar.

`textAnchorWidth` defaults to `designWidth` and affects text only: text keeps a fixed `rem` component (so browser zoom keeps working), and a fixed length only means something relative to some width. A hand-written canvas anchoring to its own design width is correct; but when two canvases describe **the same design in two sets of units** (a library drawn on 375, pages drawn on 750, where Vant's 16px is the page's 32px), anchoring each to itself leaves the two misaligned at every viewport. Library canvases therefore always inherit the anchor of the profile they belong to, with nothing to configure. For the reasoning and the measurements see [Which canvas the static part anchors to](./architecture.md#which-canvas-the-static-part-anchors-to).

## RootFoundationOptions

```ts
interface RootFoundationOptions {
  selector?: string
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

No global styles are injected by default. `root: true` enables the main plugin's default `:root` foundation; an object customises it. The same shorthand works in `appPcPreset`, where a root-only helper setting that actually configures or enables the foundation also enables it. `container: false` and `fixedContainingBlock: false` alone describe capabilities that are already off and therefore do not inject global CSS. `rootSelector` only overrides the default selector; it is not required to enable the foundation.

`root` itself has no required members. Prefer `root: true` when there is nothing to customise; `root: {}` remains equivalent. Set `selector` only when the layout is carried by another element such as `#app`.

`containerName` must be a non-reserved CSS custom identifier. Providing it automatically enables `container`, so a named container needs no redundant `container: true`; pairing it with an explicit `container: false` is a configuration error. `layer` is one dot-separated layer name such as `adaptive-matrix` or `framework.layout`; a space, comma, empty segment or CSS-wide keyword is rejected before it can produce an invalid `container-name` / `@layer` rule. A named container profile's `query.name` follows the same custom-identifier rule.

`selector` is inserted inside `:where(...)`, so an explicitly supplied selector uses the same structural guard: strings, comments, parentheses and attribute brackets must close, and unescaped braces or a top-level semicolon are rejected before the foundation is generated.

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

- `left` / `right` / `inset-inline-*`, plus the inline components of `inset-inline` and `inset`, become the gutter when they are `0`, and `calc(original + gutter)` when they are not; `auto` and CSS-wide keywords are left alone;
- `width` / `inline-size` and friends become `min(100%, column width)` when they are `100%`;
- the block axis (`top` / `bottom`) is untouched — a centred column only constrains the inline axis.

When the column equals the viewport, the gutter is `0`, so narrow-screen output is identical to what you would have written by hand. The correction is idempotent and does not reprocess a value that already contains these variables.

Only the rule's winning local `position` declaration is considered. Order and `!important` are respected inside that declaration block; inheriting positioning or resolving a winner from another rule is not something this local transform can observe statically, and guessing would be worse than missing.

It is on by default whenever `appPcPreset`'s root foundation is enabled — both of that preset's profiles set `rootMaxWidth`, which is exactly the configuration where the problem appears. Turn it off with `appPcPreset({ root: true, fixedContainingBlock: false })` (add `rootSelector: '#app'` only when that is the actual layout root).

Outside that preset, enable it only when at least one profile sets `rootMaxWidth`. The compiler rejects `fixedContainingBlock: true` without such a profile: no centred column exists in that configuration, so the option would only rewrite declarations while keeping the gutter permanently at zero.

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
