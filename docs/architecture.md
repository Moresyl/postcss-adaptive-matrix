# Architecture and formulas

**English** · [简体中文](./architecture.zh-CN.md)

Where the numbers come from, and what the compiler deliberately does not do. For a quick option lookup see the [Configuration reference](./configuration.md).

## The pipeline

1. On initialisation, `libraries` is expanded into routes appended after `routes`.
2. `include` / `exclude` are applied by file path.
3. Each rule's canvas is resolved, with the priority given in the [Configuration reference](./configuration.md#adaptiveroute): `@adaptive` > property route > selector route > file route > `defaultProfile`.
4. Declarations are walked over the PostCSS AST, with properties and values passing through the filters.
5. Values are parsed with `postcss-value-parser`, skipping strings and URL functions.
6. Target lengths are converted into bounded fluid expressions.
7. Once a rule's declarations are done, if `fixedContainingBlock` is enabled and the rule itself declares `position: fixed`, its inline-axis insets and width are corrected.
8. `@adaptive` is rewritten as `@media` or `@container`.
9. If explicitly enabled, the low-priority root foundation layer is appended last.

Step 7 comes after step 6, so what it wraps is the converted fluid value rather than the original pixels.

## Ordinary lengths

Let the design width be `D`, the design value `P`, and the fluid lower and upper bounds `L` and `U`.

```text
preferred = P / D × 100vw
minimum   = P × L / D px
maximum   = P × U / D px
result    = clamp(minimum, preferred, maximum)
```

Negative numbers reorder the bounds, so `clamp()`'s minimum is always below its maximum.

### Monotonicity

With `D`, `L` and `U` positive, the **absolute value** of the expression above is non-decreasing in viewport width: inside the range it follows linearly with the sign of `P`, outside it is constant, and it never changes sign.

For positive `P` that is simply "non-decreasing". For negative `P` the formula is non-increasing — `-16px` on a 375 file compiles to `clamp(-20.48px, -4.26667vw, -13.65333px)`, whose value drops as the viewport widens. Negative lengths (negative margins, bleeds, reverse offsets) grow by moving away from zero, so the quantity that is actually conserved is the absolute value, not the signed number.

That property has one direct use: nothing in the output where "the viewport widens and the absolute size gets smaller" can come from the formula itself. It can only come from a canvas change across a breakpoint — two design files giving contradictory numbers for the same element. The CLI uses this for its seam check (see [Going backwards at a breakpoint](./cli.md#going-backwards-at-a-breakpoint)), and the check is complete for this class of problem: it cannot escape to some other width.

Comparing absolute values is not a detail. The first version of the check compared signed numbers, and was therefore inverted for every negative length: a desktop file asking for a deeper bleed got reported, while a bleed that nearly vanished at the breakpoint did not.

## Text lengths and accessibility

Text in plain `vw` cannot respond adequately to browser text zoom. Let `F` be `fontFluidity`:

```text
preferred = P × (1 - F) rem-part + P × F / D × 100vw
```

The static part and both bounds use `rem`; the fluid part uses `vw`/`cqi`. The default `F = 0.35` is still exactly the design value at the design width, while balancing window changes against browser zoom.

Using `rem` for the bounds too is the crucial step. When the user raises the default font size, the fluid part does not follow but the lower bound does — so at high zoom levels `clamp()` lands on its lower bound, the formula degenerates to pure `rem`, and zoom is fully effective again.

Measured in Chrome (375px viewport, default configuration, `font-size: 16px`):

| Root font size | Actual body size | Relative |
| --- | --- | --- |
| 16px | 16.00px | 100% |
| 20px | 18.97px | 119% |
| 24px | 22.77px | 142% |
| 32px | 30.36px | 190% |

In the same set of measurements, `width` and `padding` stayed at 343px / 16px throughout — only the text responds to zoom, layout sizes do not inflate with it.

These numbers cover one cross-section of the default configuration. Projects should still run WCAG 200% zoom acceptance; a compilation formula is no substitute for real accessibility testing.

### Which canvas the static part anchors to

`P × (1 - F)` is a fixed length that does not vary with the viewport, so it only means something relative to **some width**. By default that is the profile's own design width: 16px on a 1440 file is 16px at 1440, exactly as written.

Library canvases are different. Vant is drawn on 375 and the page on 750, and the two describe **the same design in two sets of units** — Vant's 16px and the page's 32px are the same size. If each anchored to its own canvas, the two `rem` parts would differ by a factor of two and never line up at any viewport:

```text
page 32px on 750  → clamp(1.59867rem, calc(1.3rem  + 1.49333vw), 1.86rem)
Vant 16px on 375  → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)   ← before the fix
```

The fluid term `1.49333vw` is already identical on both sides (`P × F / D` cancels proportionally with the canvas); the whole difference is in the static term. Measured at a 390px viewport: 26.62px for the page, 16.22px for Vant — Vant's text about 40% too small, in a pairing that is extremely common on mobile.

So the static part anchors to `textAnchorWidth`, and a library canvas always inherits the anchor of the profile it belongs to. The implementation is equivalent to "convert the length into the anchor canvas's units first, then apply the formula as usual":

```text
P_anchor = P × A / D          A = textAnchorWidth
preferred = P_anchor × (1 - F) rem-part + P_anchor × F / A × 100vw
```

The fluid term is entirely unchanged (`P_anchor × F / A ≡ P × F / D`); only the static term is normalised. For non-text lengths `F = 1`, the static term is always 0, and the output is byte-for-byte unchanged — which also explains why only text was misaligned before, while `padding` was always correct.

`textAnchorWidth` can also be set explicitly on a profile, for hand-written canvases with the same relationship between them.

## Container queries

When a profile's `query.type` is `container`, `@adaptive` emits `@container`. You normally set `unit` to `cqi` at the same time, so component sizes depend on their own container rather than the browser window.

The container must be established by the application's existing layout or by `root.container`. Do not let an element query itself; choose a stable ancestor container for a reusable component.

## What is never converted

- `url()`, `local()`, `format()`;
- quoted strings;
- `clamp()`, `min()`, `max()` that already contain a viewport or container unit — see below;
- declarations inside `@font-face`, `@page`, `@property`, `@counter-style` — those describe a resource or a page box, not an element. A print margin turned into `vw` is not the same margin;
- CSS custom properties by default (except those claimed by a library `tokenPrefix` — being claimed is itself the switch);
- values below `minPixelValue`;
- absolute values at or below `hairline`;
- anything excluded by a filter or a comment.

## Idempotence

Inside `clamp()` / `min()` / `max()`, as soon as a viewport or container unit is present, the `px` in there is left alone.

Such an expression is **an already-written bounded fluid value** — possibly by the author, possibly by this plugin on a previous pass. Its `px` are that expression's own bounds, not a size measured off a design file, and converting again means scaling twice.

The direct result is idempotent output: the same CSS run once and run three times gives identical results. Neither the plugin being registered twice in a PostCSS chain, nor a component library that was pre-compiled and then compiled again by its consumer, produces nested clamps.

The scope is deliberately limited to those three functions. `calc(100vw - 32px)` converts as usual — that `32px` really is a design-file size that simply happens to sit next to a viewport unit.

Idempotence covers two more things beyond length conversion:

- **Ignore comments survive into the output.** An ignored `40px` and a `40px` nobody ever looked at are indistinguishable, so if the comment were dropped, the second pass would convert it. Any minifier removes the comments, and an author's "don't touch this" has to survive more than one pass.
- **The root foundation is injected only once.** The output carries a `/* postcss-adaptive-matrix foundation */` marker, and a second pass that sees it skips the whole section — so a fixed ceiling like `max-inline-size: 480px` is never mistaken for a design-file size and scaled again, and no second copy is stacked on.

The conformance suite asserts this for **every** case: recompiling the output must return it unchanged.

## Nesting

In native CSS nesting, declarations inside `@adaptive` and inside conditional group rules (`@media`, `@supports`, `@layer`, `@container`, `@scope`, `@starting-style`) belong to the outer element and convert as usual:

```css
.card {
  padding: 16px;          /* default canvas */

  @adaptive pc {
    padding: 32px;        /* pc canvas, rewritten as @media */
  }
}
```

Inside an at-rule the plugin does not know, nested **rules** are still processed but **direct declarations** are not — treating them as element styles in an unknown context would be guessing.

## The limits of the fixed correction

`fixedContainingBlock` is the one place the compiler rewrites positioning, and it is deliberately narrow:

- it must be enabled explicitly (`appPcPreset` enables it when it establishes a centred column, because that is exactly the configuration where the problem appears);
- it only handles a rule that **itself** declares `position: fixed`. Inherited positioning from another rule cannot be observed statically, and guessing from selector combinations would create hidden runtime coupling;
- it only handles the inline axis;
- it only substitutes on unambiguous shapes such as `0` or `100%`, adding with `calc()` otherwise, and it is idempotent.

Beyond that, the compiler does not guess at design intent, does not move sidebars for you, and injects no JavaScript. Complex layouts belong in CSS Grid, Flexbox, container queries and explicit rules per end.
