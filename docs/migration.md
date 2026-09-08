# Migration guide

**English** · [简体中文](./migration.zh-CN.md)

Migrating from any "convert px to viewport units" setup follows the same steps: get the output to line up first, then enable the new capabilities one at a time. Map concepts rather than hunting for an identically named option.

## Step one: swap in the equivalent only

Introduce no new features yet; get the new output as close to the old as possible:

```js
adaptiveMatrix({
  profiles: {
    app: {
      designWidth: 375,     // your old viewport base width
      query: false,         // do not generate a media query wrapper
    },
  },
  precision: 5,             // your old decimal places
  strategy: 'viewport',     // plain vw, the same shape as before
  libraries: false,         // component-library adaptation off for now too
})
```

`strategy: 'viewport'` emits unbounded `vw`; fluid bounds are unnecessary in this mode. A sole profile becomes the default automatically. This is a starting point, not a byte-for-byte compatibility guarantee: match property filters, ignored values, hairline handling and rounding against your existing output. For example, the default `hairline: 1` preserves a 1px border; use `hairline: 0` only if your old build intentionally scales it.

## Step two: map the concepts

| What you used to configure | Where it lives here |
| --- | --- |
| Design file width / viewport base width | a profile's `designWidth` |
| Decimal places | `precision` |
| Output unit | `unit`, or a profile's `unit` |
| Property allow/deny list | `propList` (supports `*` and `!`) |
| Selector blacklist | `selectorExclude` |
| Value blacklist | `valueExclude` |
| Minimum pixel value to convert | `minPixelValue` |
| File include/exclude | `include` / `exclude`, which also accept functions |
| Keep the original declaration as a fallback | `preserveOriginal: true` |
| Root container selector | `root.selector` |
| Maximum desktop display width | `fluid.maxWidth` + `rootMaxWidth` |
| Ignore comments | `adaptive-ignore` / `adaptive-ignore-next` / `adaptive-ignore-rule` |

Existing `/* px-to-viewport-ignore(-next) */` and `/* mobile-ignore(-next) */` directives keep working during migration; they remain in the output for the same second-pass guarantee as the native comments. No compatibility option is required. The old `postcss-pxtorem` uppercase-unit trick (`1PX`) is intentionally not an ignore signal here because CSS units are case-insensitive — use an explicit comment instead.

Two things need a different idea rather than a different name:

**Landscape is not a global switch.** Create a landscape profile with an explicit media query, and landscape gets its own design width and scaling range instead of a ratio derived from portrait.

**Desktop width is not a design width.** If desktop is just the mobile version centred, it has no design file of its own: use the app profile with `rootMaxWidth`. If desktop has its own design file, give it its own `designWidth` and put the differences in `@adaptive pc`. Those two used to be expressed by the same option; here they are two different structures.

## Step three: enable the rest

Once the visuals match, turn things on in order:

1. Remove `strategy: 'viewport'` to restore the default strategy. Add `fluid` bounds only if the design needs them: `{ maxWidth: 480 }` sets a ceiling, `{ minWidth: 320 }` sets a floor, and both give `clamp()`. Without bounds, lengths remain unbounded; switching the strategy alone does not invent a range. Text also regains the default rem/viewport hybrid;
2. Remove `query: false`, or switch to `appPcPreset` to bring in a desktop profile;
3. Drop `libraries: false`, so component libraries adapt on their own canvases (see [Component libraries](./libraries.md)). This step usually lets you delete the entire ignore list your old setup needed for them;
4. Configure `root` when you want a centred column, and `fixedContainingBlock` handles fixed-position elements along with it.

## Acceptance

- Keep the old output as a visual baseline;
- Cover 320, 375, 480, 768, 1024, 1440, 1920;
- Check fixed/sticky elements, modals, third-party components and input methods;
- Run 200% browser zoom and keyboard navigation tests — the text hybrid formula pays off exactly there, and only a real test verifies it.
