# Component libraries

**English** · [简体中文](./libraries.zh-CN.md)

## The problem

A component library has its own design file, and it is not necessarily yours. Vant is drawn on 375, your pages may be drawn on 750, and Element Plus has no design file at all — it is drawn in real pixels and was never meant to scale.

The traditional answer is to add `node_modules` to an ignore list. That only changes the shape of the problem: the page scales while the components stay put, and the two stop lining up. Not ignoring them stretches the components against a canvas that was never theirs. Those are the only two options an ignore list offers, and neither is right.

The correct answer is to give each design file its own canvas. **That is the default — there is nothing to configure.**

## The effect

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
  },
})
```

```css
/* Input — 16px in all four places */
:root       { --van-padding-md: 16px }
.van-cell   { padding: 16px }
.el-input   { padding: 16px }
.page-hero  { padding: 16px }
```

```css
/* Output */
:root       { --van-padding-md: clamp(13.65333px, 4.26667vw, 25.6px) }
.van-cell   { padding: clamp(13.65333px, 4.26667vw, 25.6px) }
.el-input   { padding: 16px }
.page-hero  { padding: clamp(6.82667px, 2.13333vw, 12.8px) }
```

The three Vant items convert on 375, Element Plus is left alone, and the page converts on 750. Three different results, each of them correct.

## The built-in list

Mobile — converted against their own design canvas:

| Name | Design width | Class prefix | Token prefix | Prefix hit rate |
| --- | --- | --- | --- | --- |
| `vant` | 375 | `van-` | `--van-` | 1288/1407 |
| `nutui` | 375 | `nut-` | `--nut-` | 1398/1497 |
| `varlet` | 375 | `var-` | — † | 1749/1879 |
| `antd-mobile` | 375 | `adm-` | `--adm-` | 798/829 |
| `antd-mobile-2x` | 750 | `adm-` ‡ | `--adm-` ‡ | 798/829 |
| `taro-ui` | 750 | `at-` * | — | 711/722 |

Desktop — drawn in real pixels, where the correct adaptation is to leave them alone:

| Name | Design width | Class prefix | Token prefix | Prefix hit rate |
| --- | --- | --- | --- | --- |
| `element-plus` | keep pixels | `el-` | `--el-` | 3180/3251 |
| `antd` | keep pixels | `ant-` | — | 5941/6050 |
| `arco-design` | keep pixels | `arco-` | — | 3462/3763 |
| `naive-ui` | keep pixels | `n-` * | — | generated at runtime |
| `quasar` | keep pixels | `q-` * | — | 2080/3363 |
| `mui` | keep pixels | `Mui` | — | generated at runtime |

Every entry also matches by package path (`/vant/`, `/@nutui/` and so on), so it works whether or not the output is still split into files.

The three prefixes marked `*` are not enabled in automatic mode; why is below. † see [Tokens without a prefix](#tokens-without-a-prefix), ‡ see [One prefix, two canvases](#one-prefix-two-canvases).

### This table was checked

"Prefix hit rate" is the number of rules containing that prefix in the library's **published stylesheet** ÷ the total rule count — measured, not copied from documentation. The verification script is in the repository and you can run it yourself:

```bash
npx tsx scripts/verify-libraries.ts          # all of them
npx tsx scripts/verify-libraries.ts vant     # one
```

It downloads each library's published artifact, compiles it with a realistic `node_modules` path, and then checks: whether the prefix and token prefix really exist, which canvas the route lands on, whether the result is idempotent, whether there are warnings, and whether the breakpoint seam check produces a false positive. All 12 entries currently pass.

**One column it does not cover: design width.** A stylesheet does not reveal how wide the file it was drawn on was; that column comes from each library's own documentation and the script cannot check it.

`naive-ui` and `mui` generate their styles at runtime, so there is no stylesheet on disk — nothing goes through PostCSS and there is nothing to check. The entries are still useful: they are "keep pixels", so your hand-written `.n-button` overrides are not scaled.

The list is readable from code:

```js
import { BUILT_IN_LIBRARIES } from 'postcss-adaptive-matrix'
```

## How matching works

An entry offers up to three channels, and matching any one of them assigns the CSS to that library's canvas:

- **Class prefix** — without the dot. `'van-'` matches `.van-cell` and `.page .van-cell`, but not `.caravan-slot`;
- **Custom-property prefix** — such as `'--van-'`. Being claimed is itself the switch, so this is not gated by `transformCustomProperties`; that option governs variables you wrote;
- **File path** — the fallback for when the build output is still split into files.

Priority: property name > selector > file path.

A selector beats a file path because the selector is part of the CSS itself, whereas a path only reflects how the build tool happened to arrange files at the time — once a bundler inlines a dependency, the path is gone. The reasoning for property names is the same and stronger: theme tokens are declared on `:root` and leave no trace of their origin beyond their name.

## A rule can only have one answer

A selector list can straddle canvases:

```css
.van-cell, .page-hero { padding: 16px }
```

`.van-cell` belongs to the Vant canvas and `.page-hero` to the default one, but `padding: 16px` has only one value to emit — CSS cannot give one declaration a different result per selector in the list. The compiler compiles the whole rule on the first canvas that matches, and the other selector gets a conversion that is not its own.

This warns, naming the selector that lost. Splitting into two rules fixes it:

```css
.van-cell { padding: 16px }
.page-hero { padding: 16px }
```

Commas inside attribute values are not selector boundaries and are never split.

Commas inside `:is()` and `:where()` are argument separators rather than selector boundaries, but the ambiguity they create is exactly the same one — `:is(.van-cell, .page-hero)` is still one declaration wanted on two canvases — so they warn too. What differs is the price of the fix, and the warning works that out rather than leaving it to you: `:is()` matches every branch at the specificity of its **highest** one, so pulling the branches apart is free only when they already agree. When they do not, the warning says so and names what the split would cost:

```
Selector list inside :is() spans more than one canvas: ".page-hero" belongs to app
but the whole rule is compiled against library:vant, because one declaration can
only have one result. Give each branch its own rule. Splitting is not
specificity-neutral: :is() matches every branch at its highest, 1-1-0, so
".page-hero" would drop to 0-1-0.
```

## What a selector is *about*

`:not()` and `:has()` do not route at all — not their arguments, anyway:

```css
.page-hero:not(.van-cell) { padding: 16px }
```

This rule styles page elements. It styles exactly the ones that are **not** Vant cells. Reading `.van-cell` out of it and sending the rule to Vant's 375 canvas gives a padding twice the size the author asked for, and nothing in the output says so. The same goes for `:has()`: `.page-card:has(.van-icon)` is a page card, whatever it happens to contain.

So routing looks at the **subject** of the selector, and the arguments of `:not()` and `:has()` are removed before anything is matched. `:is()` and `:where()` are the opposite case — their arguments *are* alternatives for the subject — which is why those are kept, and why they are the ones that can straddle canvases and warn.

This matters more than the hand-written example suggests, because atomic CSS frameworks emit these shapes constantly. One `space-x-4` compiles to `:where(& > :not([hidden]) ~ :not([hidden]))` in Tailwind 4, to a flat `> :not([hidden]) ~ :not([hidden])` in UnoCSS wind3, and to native nesting in UnoCSS wind4 — three unrelated spellings of one utility, all of them putting a selector inside a functional pseudo-class whose argument names an element the rule does not style.

## Theme tokens

A token whose name contains a text-property word takes the `rem + vw` hybrid rather than the plain `vw` of an ordinary length:

```css
:root {
  --van-font-size-md: 14px;
  --van-cell-font-size: 14px;
}
```

Both are recognised as font sizes. Emitted as ordinary lengths, the library's text would stop responding to browser zoom — the user increases the font size, your own text grows, and the text inside components does not.

### Tokens without a prefix

Varlet's custom properties carry no library prefix: they are simply `--field-padding`, `--icon-size-md`, `--card-width`, declared on a bare `:root`. So the registry gives it **no `tokenPrefix`**: claiming those names means claiming `--card-width` itself, any project may define a variable of the same name, and a false match is silent.

The blast radius is small — Varlet's own stylesheet matches by path and lands on the 375 canvas as usual. But if you override the theme **in your own CSS**, as the official docs suggest:

```css
/* your own file: not under @varlet, and no prefix to recognise */
:root { --field-padding: 16px }
```

that line is not claimed, and needs an explicit route:

```js
adaptiveMatrix({
  routes: [{ profile: 'library:varlet', property: ['--field-', '--icon-size-'] }],
})
```

### One prefix, two canvases

antd-mobile publishes the same stylesheet twice: `bundle/` drawn on 375 and `2x/bundle/` drawn on 750. The class names and token names are identical (measured on 5.42.3: every length in the latter is exactly double the former, `font-size: 16px` against `32px`), and **only the path tells them apart**.

Routing on the `.adm-` prefix alone would convert the 2x artifact against 375, making every size on the page exactly twice what it should be — no error, no warning, just uniformly too big.

So the `antd-mobile-2x` entry is **path-scoped**: its prefix channel only counts when the path matches too. Path-scoped routes are tested before unscoped ones, because "class name plus path" is more specific than "class name alone":

- compiling `2x/bundle/style.css` → the 750 canvas;
- compiling `bundle/style.css` → the 375 canvas;
- when a bundler has inlined the dependency and the path no longer exists → falls back to 375, which is the default artifact.

Both entries are present in automatic mode, with nothing to configure. When your own library has the same shape, `scoped: true` is the same switch:

```js
adaptiveMatrix({
  libraries: [
    { name: 'acme-2x', designWidth: 750, prefix: 'acme-', file: [/[\\/]acme[\\/]2x[\\/]/], scoped: true },
  ],
})
```

`scoped` without `file` is an error — the path scope is the entire reason it may claim someone else's prefix, and without it the entry degrades into a duplicate decided by declaration order.

## Prefixes held back in automatic mode

The prefixes of `naive-ui` (`.n-`), `quasar` (`.q-`) and `taro-ui` (`.at-`) really are the official ones, but they are also hard to tell apart from ordinary application class names. In automatic mode those three **match by file path only**.

Naming the library explicitly states that its prefix is safe in this codebase, and the prefix channel comes back:

```js
adaptiveMatrix({ libraries: ['vant', 'naive-ui'] })
```

A false match is silent — it scales an element against the wrong canvas, or skips an element that should have scaled, with no error and no warning. The default is strict because a wrong adaptation is harder to find than a missing one.

## Overriding a built-in entry

Use `extends` to change one field and inherit the rest. `name` is inherited too, so diagnostics and the derived canvas name still point at the library a reader recognises:

```js
adaptiveMatrix({
  libraries: [{ extends: 'vant', designWidth: 750 }],
})
```

That is the only entry point. Each library synthesises a canvas named `library:<name>`, and `library:` is a reserved prefix — writing `'library:vant'` directly in `profiles` would be overwritten by the synthesised result and therefore have no effect, so that configuration is an error that points you back to `extends`.

## Adding a library that is not listed

```js
adaptiveMatrix({
  libraries: [
    'vant',
    {
      name: 'acme-ui',
      designWidth: 375,
      prefix: 'acme-',
      tokenPrefix: '--acme-',
      file: [/[\\/]@acme[\\/]ui[\\/]/],
    },
  ],
})
```

Providing an array means only the listed entries are enabled — in the configuration above, every built-in other than Vant and acme-ui is off.

## Turning it off

```js
adaptiveMatrix({ libraries: false })
```

You can still handle things yourself with explicit `routes`, `exclude: /node_modules/`, `selectorExclude` and the comment directives.

## Types

```ts
type LibraryEntry =
  | string                                              // a built-in name
  | LibraryAdaptation                                   // a complete definition
  | (Partial<LibraryAdaptation> & { extends: string })  // adjust a built-in

interface LibraryAdaptation {
  name: string
  designWidth: number | false
  prefix?: string | string[]
  tokenPrefix?: string | string[]
  file?: FileMatcher | FileMatcher[]
  scoped?: boolean
  basedOn?: string
}
```

`basedOn` says which profile's fluid range, unit and strategy to borrow; it defaults to `defaultProfile`. The derived canvas replaces only `designWidth`, so it stops growing at the same viewport width as the page — which is exactly why the components and the page stay aligned.

A derived canvas also inherits its profile's `textAnchorWidth` (which by default is that profile's `designWidth`), see below.

### Where a library canvas anchors its text

A library canvas and a page canvas describe **the same design in two sets of units**: with Vant on 375 and the page on 750, Vant's 16px and the page's 32px are the same size, and after compilation they must render identically at any viewport.

Ordinary lengths get this for free — both reduce to `value ÷ canvas`. Text does not: to keep browser text zoom working, text retains a fixed `rem` component, and a fixed length only means anything relative to some width. If each canvas anchored to itself, that `rem` would be off by a factor of two:

```text
page 32px on 750  → clamp(1.59867rem, calc(1.3rem  + 1.49333vw), 1.86rem)
Vant 16px on 375  → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)   ← before the fix
```

The fluid terms are already identical; the whole difference is in the static term. At a 390px viewport that is 26.62px against 16.22px — Vant's text about 40% too small, and invisible at both 375 and 1440 (each design file is correct on its own). **A 750-file project using Vant is one of the most common mobile combinations there is.**

So a derived canvas takes its text anchor from the profile it belongs to, and both sides produce the same formula. This is the default and needs no configuration. For the reasoning and the derivation see [Which canvas the static part anchors to](./architecture.md#which-canvas-the-static-part-anchors-to).

Entries expand into routes appended after `routes`, so your explicit routes always win.
