# Migration guide

**English** · [简体中文](./migration.zh-CN.md)

Migrating from any "convert px to viewport units" setup follows the same steps: get the output to line up first, then enable the new capabilities one at a time. Map concepts rather than hunting for an identically named option.

## Step one: swap in the equivalent only

Introduce no new features yet; get the new output as close to the old as possible:

```js
adaptiveMatrix({
  defaultProfile: 'app',
  profiles: {
    app: {
      designWidth: 375,     // your old viewport base width
      fluid: { minWidth: 320, maxWidth: 480 },
      query: false,         // do not generate a media query wrapper
    },
  },
  precision: 5,             // your old decimal places
  strategy: 'viewport',     // plain vw, the same shape as before
  libraries: false,         // component-library adaptation off for now too
})
```

`strategy: 'viewport'` emits unbounded `vw`, byte-comparable with a traditional setup. At this point the only differences should be rounding.

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

Two things need a different idea rather than a different name:

**Landscape is not a global switch.** Create a landscape profile with an explicit media query, and landscape gets its own design width and scaling range instead of a ratio derived from portrait.

**Desktop width is not a design width.** If desktop is just the mobile version centred, it has no design file of its own: use the app profile with `rootMaxWidth`. If desktop has its own design file, give it its own `designWidth` and put the differences in `@adaptive pc`. Those two used to be expressed by the same option; here they are two different structures.

## Step three: enable the rest

Once the visuals match, turn things on in order:

1. Put `strategy` back to the default `clamp` — sizes gain a floor and a ceiling, and stop growing without limit on a large screen;
2. Remove `query: false`, or switch to `appPcPreset` to bring in a desktop profile;
3. Drop `libraries: false`, so component libraries adapt on their own canvases (see [Component libraries](./libraries.md)). This step usually lets you delete the entire ignore list your old setup needed for them;
4. Configure `root` when you want a centred column, and `fixedContainingBlock` handles fixed-position elements along with it.

## Acceptance

- Keep the old output as a visual baseline;
- Cover 320, 375, 480, 768, 1024, 1440, 1920;
- Check fixed/sticky elements, modals, third-party components and input methods;
- Run 200% browser zoom and keyboard navigation tests — the text hybrid formula pays off exactly there, and only a real test verifies it.
