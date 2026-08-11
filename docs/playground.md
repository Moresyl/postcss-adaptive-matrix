---
aside: false
outline: false
---

# Playground

**English** · [简体中文](./playground.zh-CN.md)

The compiler itself, running in this tab. Nothing is sent anywhere: the plugin has one runtime dependency and no Node API in its path, so the published source is imported straight into the page and PostCSS runs in your browser. What appears on the right is what your build would emit.

Edit either pane and the output follows. The options pane is a JavaScript expression rather than JSON, so a regular expression in `selectorExclude` or a function `designWidth` works here exactly as it does in a config file — and so does `appPcPreset({ app: 375, pc: 1440 })` on its own.

<ClientOnly>
  <Playground />
</ClientOnly>

## Reading the output

`clamp(min, fluid, max)` is three numbers with three jobs. The middle one is the design value expressed against the canvas width — 24px on a 375 canvas is `6.4vw`. The outer two are that same ratio evaluated at the canvas's `fluid.minWidth` and `fluid.maxWidth`, which is what stops a 4K monitor from getting a 90px body font.

Text is different on purpose. It compiles to `rem + vw` rather than `vw` alone, because a size expressed only in viewport units ignores the reader's own font-size setting and stops responding to browser zoom — a WCAG 1.4.4 failure. `fontFluidity` is the ratio between the two halves; set it to `0` and text is plain `rem`, fluid layout with fixed type.

A `1px` border stays `1px`. Hairlines are a rendering decision rather than a measurement, and scaling them produces the blurry half-pixel edges the `hairline` option exists to prevent.

## Where to go next

- [Getting started](./getting-started.md) — the same thing in a real project
- [Configuration reference](./configuration.md) — every option in the pane above
- [Architecture and formulas](./architecture.md) — where each number comes from
