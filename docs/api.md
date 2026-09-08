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

For an in-process continuity check, compose the exported analyzer with the compiled root. Pass the same root font size to both conversion and analysis (the default is 16). Resolve a dynamic root font size once for the file and supply that number to both calls, rather than invoking a changing callback twice.

```ts
import { compileAdaptiveCss, findContinuityIssues } from 'postcss-adaptive-matrix'

const rootValue = 20
const output = await compileAdaptiveCss(source, { rootValue })
const root = output.result.root
// A custom PostCSS parser can return a Document instead of one stylesheet.
if (root.type !== 'root') throw new Error('Analyze Document roots separately')
const seams = findContinuityIssues(root, rootValue)
const accepted = output.gate?.passed !== false && seams.length === 0
```

This is a static check for backwards length steps at resolvable viewport breakpoints, not a layout or visual test. Unresolvable values and conditions are skipped; an empty report does not certify every responsive layout. The optional root font size defaults to 16; an explicitly supplied value must be a positive finite number or the analyzer throws a `RangeError`.

The package includes ESM and CommonJS type declarations. Import `AdaptiveCompileOptions`, `AdaptiveCompileResult`, `AdaptiveCompileGate` and `AdaptiveCompileGateCategory` instead of restating the result contract.

## Errors and recovery

A syntax error, invalid request or throwing configuration callback rejects the compile promise. A diagnostic gate failure does not: inspect `output.gate?.passed === false` before accepting output into a build. Warnings and PostCSS results belong to each call, so a failed or warning-producing request does not contaminate later requests on the same compiler. Dynamic rulers are refreshed on the next compilation even after a callback throws.

```ts
const compile = createAdaptiveCompiler()
try {
  const output = await compile('.card { padding: 24px }', { failOn: ['warnings'] })
  if (output.gate?.passed === false) {
    console.error('CSS quality gate failed', output.warnings.map((warning) => warning.text))
  } else {
    console.log(output.css)
  }
} catch (error) {
  console.error('CSS compilation failed', error instanceof Error ? error.message : 'Unknown error')
}
```

In a service, keep detailed compiler diagnostics in trusted logs: source paths and authored CSS can be sensitive. Return a suitable public error instead of exposing raw exceptions to untrusted clients.
