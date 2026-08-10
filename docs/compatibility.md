# Browser support and degradation

**English** · [简体中文](./compatibility.zh-CN.md)

The compiler emits more than numbers. `clamp()` is syntax, `@layer` is syntax, and so are `:where(#app)`, `env(safe-area-inset-top)` and `inline-size` — each with its own support threshold, and those thresholds span nearly a decade.

This page lists every threshold, and answers the same question for each one: **when it is unsupported, what disappears, and what switching it off costs.**

## CSS does not error, it discards

That is the premise of this whole page. A browser that meets CSS it cannot read does not throw, does not fall back to the previous value, and leaves nothing in the console. It treats the part it cannot read **as if it had never been written**. How much is discarded depends on which layer the unreadable thing is in:

| What it cannot read | What is voided | Example |
| --- | --- | --- |
| A value | That declaration | `padding: clamp(...)` → the element has no padding |
| A selector | That whole rule | `:where(#app) { ... }` → every declaration of the root container |
| An at-rule | Everything in that block | `@layer { ... }` → the entire root foundation |

So the order to work through is not "which feature is newest" but **how much is lost**. That is the order below, and the order of the `COMPAT_FEATURES` table in the code.

## Minimum versions

| Feature | Chrome | Edge | Safari | iOS Safari | Firefox | Samsung |
| --- | --- | --- | --- | --- | --- | --- |
| `@layer` | 99 | 99 | 15.4 | 15.4 | 97 | 18.0 |
| `:where()` ¹ | 88 | 88 | 14 | 14.0 | 78 | 15.0 |
| `:has()` ³ | 105 | 105 | 15.4 | 15.4 | **121** | 20 |
| `@container` / `container-type` | 106 | 106 | 16.0 | 16.0 | 110 | 20 |
| `clamp()` `min()` `max()` | 79 | 79 | 13.1 | 13.4 | 75 | 12.0 |
| `cqw` / `cqi` | 105 | 105 | 16.0 | 16.0 | 110 | 20 |
| `vi` ² | 108 | 108 | 15.4 | 15.4 | 101 | 21 |
| `inline-size` / `margin-inline` | 89 | 89 | 15 | 15.0 | 66 | 15.0 |
| `var()` | 49 | 16 | 10 | 10.0 | 31 | 5.0 |
| `env(safe-area-inset-*)` | 69 | 79 | 11.1 | 11.3 | 65 | 10.1 |
| `vw` | 26 | 16 | 6.1 | 8 | 19 | 4 |
| Native nesting ³ | 120 | 120 | 17.2 | 17.2 | 117 | 25 |

¹ caniuse has no separate entry for `:where()`, so this uses `:is()`. Not a stand-in of convenience: both come from the same section of the specification and shipped together in Chrome 88, Firefox 78 and Safari 14.
² Likewise, `vi` uses the `svh` / `lvh` / `dvh` entry — same spec batch, same releases.
³ Neither `:has()` nor native nesting is **emitted** by the compiler; both are listed because they reach your output through your own CSS or a component library, and shipping them is still shipping them. Nesting cannot be detected without guessing, so it is not; `:has()` can, so it is. See below.

Read that `:has()` row across rather than down. Chrome had it in 2022 and Safari before that, and Firefox did not until the end of 2023 — the widest gap in the table between the first browser and the last. It is the one row where a stylesheet can look completely correct in three browsers while losing whole rules in the fourth.

Data from caniuse-lite `1.0.30001809`, baked into `src/core/compat-data.ts` by `scripts/capture-compat.mjs`.

## Feature by feature: what is lost, how to switch it off

### `@layer` — the biggest single loss

**What emits it**: `root.layer`. `appPcPreset` sets it to `'adaptive-matrix'` whenever a `rootSelector` is given.

**What is lost**: the entire `@layer` block is voided, so the root foundation goes **all at once** — the centred column, the safe-area variables and the fixed-position correction disappear together. This is the largest single loss in the table.

**How to switch it off**: `root: { layer: false }` emits the same rules unwrapped. The cost is cascade position: the foundation used to lose to your own CSS automatically by sitting in a lower layer, and without that it competes at ordinary specificity. Places you used to override casually may now need a real selector.

### `:where()`

**What emits it**: every rule of the root foundation, with `root.selector` wrapped inside it.

**What is lost**: an unreadable selector voids the whole rule — the same outcome as losing `@layer`, just one rule at a time.

**How to switch it off**: `root: false`, removing the foundation entirely. Blunt, but it is the supported path. There is no option to emit a bare selector, because **zero specificity is the entire reason it is there**: it lets your CSS override the foundation without a specificity fight. Offering that switch would be offering a switch that silently changes cascade behaviour.

### `:has()`

**What emits it**: nothing here. It arrives from your own CSS or from a component library, survives the pass untouched, and ships.

**What is lost**: the whole rule, like any unreadable selector. What makes it worth its own row is not the size of the failure but *when* support arrived. `:has()` is the newest selector in everyday use, and the four engines are years apart on it — Chrome 105 in August 2022, Safari 15.4 before that, Firefox not until 121 in December 2023. A stylesheet that has been reviewed in Chrome and Safari can be silently missing rules in an older Firefox.

**How to switch it off**: not a switch — a rewrite. Express the condition on the element itself: a class the component already sets when it has the child, or `:not(:empty)` where that is what `:has(*)` was standing in for.

Routing is not affected either way. A `:has()` argument names what an element *contains*, not which design file it was drawn on, so it is removed before a rule's canvas is decided — `.page-card:has(.van-icon)` is a page card, whatever it happens to hold. See [Component libraries](./libraries.md#what-a-selector-is-about).

### `@container` and the container units `cqw` / `cqi`

**What emits it**: `root.container: true`; a profile with `query: { type: 'container' }`; `unit: 'cqw'` or `'cqi'`.

**What is lost**: the `container-type` declaration is voided, which is quiet; an `@container` block is voided entirely, which is not — a profile that switches on a container query stops switching, and every canvas other than the default disappears. Container units behave like `clamp()`: they take their declaration with them.

**How to switch it off**: `root: { container: false }`, a profile query using `type: 'media'`, and `unit` back to `'vw'`. A media query measures the viewport rather than an ancestor — and unless the component really does reflow independently inside a draggable panel, the viewport was what you wanted anyway.

### `clamp()` / `min()` / `max()`

**What emits it**: every converted length under `strategy: 'clamp'` (the default), plus the gutter arithmetic in `root.fixedContainingBlock`.

**What is lost**: every declaration containing one is voided, and the property falls back to its inherited or initial value. Not "the size is a bit off" — **no size at all**.

**How to switch it off**: two options, which stack.

```js
adaptiveMatrix({
  ...appPcPreset(),
  strategy: 'viewport',    // bare vw, with no bounds
  preserveOriginal: true,  // keep an original px declaration in front
})
```

`strategy: 'viewport'` switches to bare viewport lengths, supported almost everywhere, at the cost of having no bounds — the design scales straight past both ends of the fluid range. `preserveOriginal` is the other half: the original pixel value is kept as a preceding declaration, so a browser that drops the fluid one lands on the design-file size rather than on nothing.

### Logical properties `inline-size` / `margin-inline` / `max-inline-size`

**What emits it**: the root foundation, whenever `root` is configured.

**What is lost**: one declaration at a time. **This is the only entry in the table whose failure still looks like a working page**: without `margin-inline: auto` the column is exactly the right width, sitting firmly against the left edge of the screen; without `max-inline-size` it goes full-bleed. Neither looks like "unsupported" — both look deliberate. And precisely because it does not look like a fault, it is likelier to ship than a visible collapse like `@layer`.

**How to switch it off**: `root: { logical: false }` writes `width`, `margin-left` / `margin-right` and `max-width` instead. Nothing is lost on a horizontal page — the two spellings are the same thing until the writing mode changes.

```js
appPcPreset({ rootSelector: '#app', rootLogical: false })
// or
adaptiveMatrix({ root: { selector: '#app', logical: false } })
```

### `vi`

**What emits it**: `unit: 'vi'`.

**What is lost**: the declaration is voided.

**How to switch it off**: `unit: 'vw'` (the default). `vi` follows the writing mode, and the two differ only with vertical text or a rotated root element; on a horizontal page they measure the same length, and `vw` has been there since Safari 6.1.

### `env(safe-area-inset-*)`

**What emits it**: `root.safeAreaVariables`.

**What is lost**: this one is worth stating precisely, because the fallback argument does something other than what it looks like. The `0px` in `env(safe-area-inset-top, 0px)` covers the case where **the browser knows the environment variable but has no value for it** — not the case where the browser has never heard of `env()`. In the latter, `--adaptive-safe-top` holds an unreadable value, and every declaration reading it through `var()` is voided together at computed-value time.

**How to switch it off**: `root: { safeAreaVariables: false }`. Every browser without `env()` also predates the notches it exists to avoid — there is nothing to compensate for.

### `var()`

**What emits it**: `root.safeAreaVariables` and `root.fixedContainingBlock`, plus any design tokens of your own that pass through the compiler.

**What is lost**: the declaration is voided.

**How to switch it off**: `safeAreaVariables: false` + `fixedContainingBlock: false` removes the ones the compiler introduces. Supported since Safari 10 / Chrome 49, so this row is usually there to be ticked rather than acted on.

### `vw`

**What emits it**: `unit: 'vw'` (the default), and the root column arithmetic.

**What is lost**: the declaration is voided.

**How to switch it off**: you cannot, and you do not need to. This is the oldest entry in the table (Safari 6.1, 2013), older than every other row. Switching it off means not adapting at all.

### Native nesting

**What emits it**: nobody. The compiler **reads** nested rules — including an `@adaptive` nested inside one — and writes each declaration back where it was. Nesting in your output can only be there because it was in your source.

**What to do**: flatten it before shipping. Sass and Less already do; plain CSS has postcss-nesting. The audit **deliberately does not guess**: pattern-matching native nesting would misread ordinary CSS as nested, and a false report is worse than no report.

## The whole audit in one command

Give `--targets` a list of "browser + the oldest version you intend to support":

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

```
  needs @layer — iOS Safari 13 < 15.4, Chrome 90 < 99
          from: root.layer, which appPcPreset sets to 'adaptive-matrix' whenever a rootSelector is given
          seen: @layer adaptive-matrix { :where(#app) {
          if unsupported: The whole @layer block is dropped, so the entire root
          foundation goes with it — the centred column, the safe-area variables
          and the fixed-position correction all vanish at once.
          instead: root.layer: false emits the same rules unwrapped. ...
  needs :where() — iOS Safari 13 < 14.0-14.4
  needs clamp(), min(), max() — iOS Safari 13 < 13.4-13.7
  needs inline-size, margin-inline, max-inline-size — iOS Safari 13 < 15.0-15.1
```

(That is the real output for this repository's `examples/app-pc`, with only the long sentences truncated. Note the `clamp()` line: iOS Safari 13 misses by a point release, not a major one — 13.4 has it. That is exactly the gap the eye skips when comparing version numbers by hand.)

When every target is new enough there is one line:

```
  every target reads all 7 CSS features in this output
```

Known names: `chrome`, `edge`, `safari`, `firefox`, `ios_saf`, `samsung`; `android` and `webview` map to `chrome` (which is what they run anyway). An unrecognised name **is an error and exits 1** rather than being skipped silently — a target quietly dropped is worse than no audit at all, because it reads like a pass.

### The audit reads the output, not the configuration

That is the only way to guarantee the audit and the output never drift apart. A feature that reaches the stylesheet through a preset, through a component-library route, or through your own hand-written CSS is a feature you shipped, and reading the output sees all of them. There is far too much that cannot be read out of a configuration.

## Failing the build

The same checks are exported from the package, without going through the CLI:

```js
import postcss from 'postcss'
import adaptiveMatrix, { auditCompatibility } from 'postcss-adaptive-matrix'

const result = await postcss([adaptiveMatrix(options)]).process(css, { from })
const audit = auditCompatibility(result.root.toString(), {
  ios_saf: 13,
  chrome: 90,
})

if (audit.unknownBrowsers.length) throw new Error('a target name is misspelled')
for (const { feature, shortfalls } of audit.findings) {
  console.error(feature.title, '→', shortfalls.map((s) => `${s.name} ${s.target} < ${s.since}`))
}
if (audit.findings.length) process.exit(1)
```

`auditCompatibility(css, targets)` returns `{ findings, satisfied, unknownBrowsers }`. Also exported: `detectFeatures(css)` (features only, no version comparison), `COMPAT_FEATURES` (the full feature table, where the `failure` and `fallback` prose lives), `FEATURE_SUPPORT` (the version data) and `compatFeature(id)`. Fully typed.

## What the data is, and is not

**The versions are baked into the package; caniuse-lite is only a devDependency.** "Which version a feature became usable in" is history and will not change again, so the plugin needs no runtime dependency for it and the audit works offline.

**Usage share is deliberately not consulted.** Whether 0.4% of users count is a decision about your project, not a fact about this stylesheet. `browserslist` is already the place that answers that question.

**`--targets` takes explicit "name + version" pairs, not a browserslist query.** A query would pull in the browserslist package, answers a question about your users rather than about this stylesheet, and — crucially — **the same query changes meaning as the database updates**: a build that passes today goes red next month on a data refresh, with not one character of code changed. Explicit version numbers do not do that.

**It scans for the version from which support was never lost again**, not the first version showing a `y`. A few features shipped and were then withdrawn, and the former is the answer to "safe from this version on". A caniuse range such as `13.4-13.7` is a span it does not track separately, and the audit takes the low end.

## This is not a substitute for real devices

To be clear about what this audit proves: **every target browser can parse every piece of syntax in this CSS.** That is all.

It does not prove the page looks right on that device. Real devices test something else — rendering differences, the keyboard pushing the viewport up, the height jump when the address bar collapses, a WebView's custom behaviour. The [optional runtime](./runtime.md) has patches for those, but that is a different problem.

Conversely, real devices cannot test version thresholds either: the iPhone on your desk runs iOS 17, and the fact that it reads `@layer` says nothing about iOS 15.4 and below. Testing that needs a cupboard of old devices rather than one good one. The audit does exactly that half — and does it more completely than a cupboard would.

## Related

- [Configuration reference](./configuration.md) — the full semantics of every switch above
- [CLI preview](./cli.md) — `--targets` and the rest of the options
- [Optional runtime](./runtime.md) — keyboards, address bars, WebViews
- [Release and compatibility](./release.md) — artifact formats and Node versions
