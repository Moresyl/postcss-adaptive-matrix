# Programmatic API

**English** · [简体中文](./api.zh-CN.md)

Use the API when a build tool, editor, service or test needs compiled CSS as data instead of invoking a command. The only required argument is the CSS string; configuration, PostCSS processing options, browser targets and quality gates are optional.

## One stylesheet

```ts
import { compileAdaptiveCss } from 'postcss-adaptive-matrix'

const output = await compileAdaptiveCss('.card { padding: 24px }')
console.log(output.css)
```

`output` contains `css`, `warnings`, `map`, `compatibility`, `gate` and the full PostCSS `result`. Without `targets`, `compatibility` is `null`; without `failOn` (or with `[]`), `gate` is `null`. Syntax and configuration errors reject the promise.

## Reuse a compiler

```ts
import { createAdaptiveCompiler } from 'postcss-adaptive-matrix'

const compile = createAdaptiveCompiler({ profiles: { app: 375 } })
const output = await compile(source, {
  process: { from: 'src/card.css', to: 'dist/card.css', map: { inline: false } },
  targets: { safari: 14 },
  failOn: ['warnings', 'compatibility'],
})
```

One compiler instance retains conversion caches while dynamic file-based rulers refresh for every call. Requests snapshot target, gate and source-map option fields before asynchronous processing.

## Gates and maps

Compatibility gates require `targets` and fail for unsupported features or unknown browser names. A failed gate still returns CSS and diagnostics; the caller chooses whether to set an exit code. Inline PostCSS maps are embedded in CSS and therefore leave `map` undefined; external maps return a map object. `process.map.prev` chains an upstream map.

The API gate covers warnings and compatibility, not CLI continuity analysis. Use the [CLI JSON report](./cli.md) when continuity findings are part of the build policy.

The package includes ESM and CommonJS type declarations. Import `AdaptiveCompileOptions`, `AdaptiveCompileResult`, `AdaptiveCompileGate` and `AdaptiveCompileGateCategory` instead of restating the result contract.
