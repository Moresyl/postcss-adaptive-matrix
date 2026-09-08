---
aside: false
outline: false
---

# Playground

**English** · [简体中文](./playground.zh-CN.md)

The compiler runs locally in a dedicated browser Worker using the same source as the package. The playground does not upload your CSS or configuration. Configuration expressions are executable JavaScript and can make their own network requests: run only code you trust. A Worker keeps compilation away from the document but is not a security sandbox.

Each edit starts a fresh compilation after a short pause. Work that exceeds five seconds is terminated, and leaving the page stops pending work. The displayed duration measures configuration evaluation and compilation, excluding Worker startup; it is not a cross-machine benchmark. Previous output is dimmed while compiling or after an error.

Edit either pane and the output follows. The options pane is a JavaScript expression rather than JSON, so a regular expression in `selectorExclude` or a function `designWidth` works here exactly as it does in a config file — and so does `appPcPreset({ app: 375, pc: 1440 })` on its own.

<ClientOnly>
  <Playground />
</ClientOnly>

## Reading the output

Both `fluid.minWidth` and `fluid.maxWidth` are optional. Two bounds produce `clamp(min, fluid, max)`, one produces `min()` or `max()`, and no bounds leave the fluid expression unbounded. For example, 24px on a 375 canvas is `6.4vw` before bounds are applied. Try the maximum-only and container-unit samples to see these differences.

Text combines rem and viewport units so part of its size follows the reader's root font setting. `fontFluidity` controls that balance; set it to `0` for plain rem. Verify text resizing and reflow in the actual page rather than treating a generated formula as proof of accessibility compliance.

A `1px` border stays `1px`. Hairlines are a rendering decision rather than a measurement, and scaling them produces the blurry half-pixel edges the `hairline` option exists to prevent.

## Where to go next

- [Getting started](./getting-started.md) — the same thing in a real project
- [Configuration reference](./configuration.md) — every option in the pane above
- [Architecture and formulas](./architecture.md) — where each number comes from
