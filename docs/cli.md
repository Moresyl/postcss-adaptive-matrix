# CLI preview

**English** · [简体中文](./cli.zh-CN.md)

Change one `designWidth`, move a `fluid` range, and seeing the effect normally means rebuilding and comparing by eye in a browser. This command shortens that to one keystroke:

```bash
npx adaptive-matrix src/styles/app.css
```

```
src/styles/app.css
  profiles: app (default), pc, +5 library canvases
  .page
    padding    16px → clamp(13.65333px, 4.26667vw, 20.48px)
    font-size  16px → clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)
  @media (min-width: 768px) › .page
    padding    48px → clamp(34.13333px, 3.33333vw, 64px)
  3 converted, 0 left as authored
```

What it prints is a **before/after list per declaration**, not the whole stylesheet. A build tool's output runs to thousands of lines, and what you actually want to confirm is usually a handful of numbers.

## Usage

```
adaptive-matrix <file...> [options]
adaptive-matrix [options] -- <file...>
cat app.css | adaptive-matrix --from src/app.css
```

`-` can name stdin explicitly, but it cannot be mixed with file paths: doing so would otherwise make one source disappear depending on its position. Likewise, `--from` applies to one input only; with several files there is no honest way for one logical path to preserve their distinct file routes.

| Option | Effect |
| --- | --- |
| `-c, --config <path>` | A module whose default export is the plugin options, or a `.json` file of options |
| `--from <path>` | Treat the input as living at this path |
| `--profile <name>` | Override `defaultProfile` |
| `--targets <list>` | Audit the output against the oldest browsers you support, e.g. `"safari 14, ios_saf 13"` |
| `--fail-on <list>` | Exit `1` on `warnings`, `continuity`, or `compatibility`; comma-separate them or use `any` |
| `--all` | List unchanged declarations too |
| `--css` | Print the compiled stylesheet instead of the comparison |
| `--json` | Print one versioned JSON report for CI, editor and dashboard integrations |
| `--color` / `--no-color` | Force colour on/off; with neither it follows the terminal and honours `NO_COLOR` |
| `--` | Stop option parsing; every remaining argument is a file path, including names beginning with `-` |
| `-h, --help` | Help |

Long options that take a value accept either spelling: `--profile app` or `--profile=app`.

Exit codes: `0` when compilation and every requested quality gate pass; `1` for a failed gate, bad argument, unreadable file, or invalid configuration. So it drops straight into a shell condition.

## Reading a configuration

Without `-c` the built-in defaults are used, and the header tells you which canvases are active.

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs
```

The config module must default-export the **plugin options object**, not a PostCSS config. When the two differ, write a separate file:

```js
// adaptive.config.mjs
import { appPcPreset } from 'postcss-adaptive-matrix'
export default appPcPreset({ appDesignWidth: 375, pcDesignWidth: 1440 })
```

A TypeScript config needs a loader:

```bash
npx tsx node_modules/postcss-adaptive-matrix/dist/cli.js src/app.css -c adaptive.config.ts
```

(Node 22.6+ strips types natively, so `npx adaptive-matrix -c adaptive.config.ts` also runs, but it prints an experimental warning and only supports erasable syntax.)

### A JSON configuration

A path ending in `.json` is read as a file of options rather than imported. Name the [published schema](https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json) in `$schema` and your editor will complete the option names, show each one's description, and flag a value that is out of range — before you run anything:

```json
{
  "$schema": "https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json",
  "defaultProfile": "app",
  "profiles": {
    "app": { "designWidth": 375, "fluid": { "minWidth": 320, "maxWidth": 600 } },
    "pc": { "designWidth": 1440, "fluid": { "minWidth": 1024, "maxWidth": 1920 } }
  }
}
```

`$schema` is not an option; it is dropped when the file is read.

What JSON cannot hold is a `RegExp` or a function, so a config that routes by a regular expression, or computes `designWidth` per file, has to stay JavaScript. The schema marks those places with `x-also`.

The configuration is validated before the first stylesheet is read, so a misspelled `defaultProfile` or a reversed `fluid` range produces the compiler's own message rather than a screenful of comparisons followed by an error.

A missing `default` (`export const options = {...}`) or an uncalled preset (`export default appPcPreset` rather than `appPcPreset({...})`) is an error. Both used to run silently on the built-in defaults — the header still listed canvases, the comparison still looked right, and nothing anywhere said your configuration had never been read.

## Rehearsing file routing

Deciding a canvas by path is the easiest thing to misconfigure and the hardest to notice — a wrong pattern is not an error, the route just silently fails to match (see [Build tool integration](./integration.md#2-from-is-required-only-for-file-sensitive-options)). `--from` exists to rehearse routing before you ship:

```bash
# The same CSS, pretending it lives under desktop/
npx adaptive-matrix scratch.css -c adaptive.config.mjs --from src/desktop/scratch.css
```

Different numbers between the two runs mean the route matched. Identical numbers mean it did not.

A Vue SFC path carries a query string; copy it in verbatim:

```bash
npx adaptive-matrix scratch.css --from 'src/views/mobile/home/index.vue?vue&type=style&lang.scss'
```

## Going backwards at a breakpoint

Two design files can each be right and still disagree at the seam. This check looks for exactly one thing: **the window gets wider and a size gets smaller.**

```
  shrinks .card font-size gets smaller at 768px: 17.57px → 16.18px
          clamp(0.94867rem, ...) → clamp(1.01125rem, ...). Widening the window makes this smaller — the two canvases disagree here.
```

`.card`'s font size is 16px on the app file and 18px on the desktop file; both are reasonable on their own. But by 767px the app canvas has already grown it to 17.57px, while the desktop canvas starts at 16.18px. Widen the browser by one pixel and the body text jumps down.

It is worth a dedicated check because it **only appears at that one width**: each design file renders correctly on its own, and the 375 and 1440 you debug at every day are both fine.

Every formula this compiler emits is non-decreasing in **absolute value** across viewport width, and never changes sign. So a size going backwards can only come from a canvas change across a breakpoint. That also makes the check complete: this class of problem cannot escape to some other width.

### Only values the compiler produced

"Can only come from a canvas change" holds only for **formulas this compiler produced**. An unconverted stylesheet that shrinks at a breakpoint is usually doing so on purpose:

```css
/* Quasar 2.19's own stylesheet */
.q-tooltip { padding: 6px 10px }
@media (max-width: 599.98px) { .q-tooltip { padding: 8px 16px } }
```

A bigger tap target on a phone, tightened up above 600px — both numbers were written by a person who compared them. Quasar is a "keep pixels" entry, neither side was converted, and reporting it would be noise.

So a report requires **at least one side to be a compiler-produced formula**. Under the default math strategy every generated length has a function wrapper: two bounds use `clamp()`, one uses `min()` / `max()`, and an unbounded or static preferred value uses the equivalent `calc(value)` marker. That is how the check distinguishes generated output without mistaking deliberately authored breakpoint pixels for a seam. The explicit compatibility mode `strategy: 'viewport'` remains bare and therefore outside this diagnostic; its whole purpose is avoiding math functions. One side converted and the other not still reports — that is precisely a canvas change, and nobody compared those two numbers.

Substitution happens before the decision, so "the declaration is just `var(--x)` and the formula is in the token" counts too.

It compares absolute values rather than signed numbers: a negative length (a negative margin, a bleed) grows by moving away from zero, so the formula compiled from `-16px` gets smaller as the window widens. A sign change across the breakpoint is never reported — zero is a boundary the compiler itself never crosses, so meeting it here means the two design files intended different things, and which one is right is not something this check can decide.

What to change is your call — raise the desktop font size, drop `pcFluidMin` from 1024 to 768, or narrow the app file's `fluid.maxWidth`. The tool only tells you where the seam is.

The check is deliberately narrow, preferring silence to a false positive: it compares only identical selector strings, does no specificity reasoning, and expands no shorthands. It skips the whole group on `@supports`, `@container`, media queries that are not pure width, groups spanning cascade layers, and values it cannot evaluate to a number such as `env()`, `%` or container units.

### Theme tokens are substituted

Component libraries almost never write literal sizes. Of Vant 4.10.0's 3198 ordinary declarations, 1173 read entirely through `var()` — a check that gave up at the first `var(` would see a small slice, and precisely the slice that avoids the layer this plugin adapts.

So custom properties in the same stylesheet are substituted first, then evaluated:

```css
:root,:host { --card-width: 40px }
.card { width: var(--card-width) }
@media (min-width: 768px) { .card { width: 20px } }
```

`.card` drops from 40px to 20px at 768px, which is only visible after substitution.

Substitution happens only when the value is decided by **viewport width alone**; both conditions must hold:

- Declared only on `:root` / `:host` / `html`, with no second copy elsewhere. One `.van-theme-dark { --card-width: ... }` abandons the whole thing — the element's value then depends on whether an ancestor carries that class, which width cannot answer.
- Every declaration is either unconditional or inside a pure pixel-width `@media`. Declarations inside `@supports`, `@container` or an orientation query abandon it as well.

A token rewritten at a breakpoint is itself a seam, even if the rule consuming it is written once:

```css
:root { --card-width: 40px }
@media (min-width: 768px) { :root { --card-width: 20px } }
.card { width: var(--card-width) }   /* written once, still reported */
```

The fallback in `var(--x, 16px)` is used only when `--x` really is undeclared — matching the browser. If `--x` is declared but its value is unknowable (the theme class above), nothing is reported, rather than taking the fallback as the answer.

The custom-property declaration itself (the `--x: ...` line) is still not checked. It is not a length on screen, and its direction is decided by whoever consumes it — this plugin's own `--adaptive-root-width` is inverted: it feeds `max(0px, (100vw - var(--adaptive-root-width)) / 2)`, where a smaller value exists to make the gutter bigger. Skipping it is not ignoring it: the declaration that consumes it is checked, and after substitution its direction is meaningful.

Measured (the complete Vant 4.10.0 stylesheet, 195 KB): evaluable value components rise from 622 (17.6%) to 1309 (36.9%), with 779 tokens collected. The rest are keywords, colours and percentages — never viewport-dependent lengths.

On false positives: across the 69 conformance fixtures, this repository's example project, and the published stylesheets of 10 component libraries (Vant, NutUI, Varlet, antd-mobile 1x/2x, Taro UI, Element Plus, Ant Design, Arco Design, Quasar — about 3.2 MB of CSS), the `shrinks` count is 0 everywhere. See [Component libraries](./libraries.md#this-table-was-checked).

To fail a build on it, the same check is exported from the package:

```js
import postcss from 'postcss'
import adaptiveMatrix, { findContinuityIssues } from 'postcss-adaptive-matrix'

const result = await postcss([adaptiveMatrix(options)]).process(css, { from })
const issues = findContinuityIssues(result.root)
if (issues.length) throw new Error(`${issues.length} breakpoint regressions`)
```

## Syntax your target browsers cannot read

`--targets` takes a list of "browser + the oldest version you intend to support" and checks each one against the **compiled output**:

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

```
  needs @layer — iOS Safari 13 < 15.4, Chrome 90 < 99
          from: root.layer, which appPcPreset sets to 'adaptive-matrix' ...
          seen: @layer adaptive-matrix { :where(#app) {
          if unsupported: The whole @layer block is dropped, so the entire root
          foundation goes with it ...
          instead: root.layer: false emits the same rules unwrapped. ...
  needs clamp(), min(), max() — iOS Safari 13 < 13.4-13.7
```

The order of those four lines is deliberate: **what disappears** first, **what to switch to** second. "iOS Safari 13 is too old" is not actionable on its own, and what has always mattered about a CSS support gap is how much goes with it — an unreadable value takes its declaration, an unreadable selector takes its rule, an unreadable at-rule takes its whole block.

The `clamp()` line above misses by **a point release**: 13.4 has it. That is exactly the gap a human comparing version numbers overlooks.

When every target is new enough, there is one line:

```
  every target reads all 7 CSS features in this output
```

Known names: `chrome`, `edge`, `safari`, `firefox`, `ios_saf`, `samsung`; `android` and `webview` map to `chrome`. An unrecognised name is an error and exits `1` rather than being skipped silently — a target quietly dropped is worse than no audit at all, because it reads like a pass.

For the full feature × version matrix, the degradation path for each feature and the programmatic API, see [Browser support and degradation](./compatibility.md).

## CI quality gates

Discovery and enforcement are separate: an ordinary preview reports findings but exits `0`; opt into exactly the categories that should block your pipeline:

```bash
npx adaptive-matrix src/app.css \
  --targets "ios_saf 15.4, chrome 99" \
  --fail-on warnings,continuity,compatibility
```

- `warnings` covers compiler diagnostics such as an unknown `@adaptive` profile;
- `continuity` covers a compiled length that goes backwards at a breakpoint;
- `compatibility` covers output syntax unsupported by a declared `--targets` browser. Selecting it without `--targets` is an error, never an empty pass.

`any` enables all three. Findings are still printed in full, then the command exits `1` and writes a compact count to stderr. With `--css`, stdout remains CSS only. With `--json`, compilation remains `"ok": true` and a separate `gate` says whether policy passed—consumers can distinguish malformed input from valid output that violates policy.

## Machine-readable reports

Use `--json` when another program, rather than a person, consumes the result:

```bash
npx adaptive-matrix src/app.css src/admin.css \
  -c adaptive.config.json \
  --targets "ios_saf 13, chrome 90" \
  --json > adaptive-report.json
```

The command writes exactly one JSON document even for several files. Its top-level shape is stable and versioned:

```json
{
  "formatVersion": 1,
  "ok": true,
  "profiles": { "default": "app", "authored": ["app", "pc"], "libraries": 6 },
  "targets": { "ios_saf": "13", "chrome": "90" },
  "gate": { "failOn": ["continuity", "compatibility"], "passed": false },
  "summary": {
    "files": 2,
    "declarations": 31,
    "converted": 18,
    "unchanged": 13,
    "warnings": 0,
    "continuityIssues": 1,
    "compatibilityFindings": 2
  },
  "files": []
}
```

Each file carries declaration changes (`context`, `prop`, `before`, `after`), compiler warnings, structured continuity issues, and—when `--targets` is present—compatibility findings with a stable feature ID, the observed sample, affected browsers, failure mode and fallback. `gate` is `null` unless `--fail-on` is present. By default `changes` contains converted/generated declarations; add `--all` to include declarations left as authored.

Errors remain machine-readable and keep exit code `1`:

```json
{
  "formatVersion": 1,
  "ok": false,
  "error": { "message": "defaultProfile \"ghost\" does not exist." }
}
```

`--json` and `--css` are mutually exclusive output protocols. JSON always goes to stdout and contains no ANSI colour codes. TypeScript consumers can import `CliJsonReport`, `CliSuccessReport`, `CliErrorReport`, `CliQualityGateReport` and `CLI_REPORT_FORMAT_VERSION` from the package rather than restating the shape.

## Seeing the whole output

| Result | `ok` | `gate` | Exit code |
| --- | --- | --- | --- |
| Processing succeeded, no gate requested | `true` | `null` | `0` |
| Processing succeeded, requested gate passed | `true` | `passed: true` | `0` |
| Processing succeeded, requested gate failed | `true` | `passed: false` | `1` |
| Argument, configuration, read or compilation error | `false` | Absent | `1` |

For a successfully parsed report of the supported format version, accept it only when `report.ok && report.gate?.passed !== false`; also require the child process to exit normally with code `0`. This condition is not runtime JSON schema validation: handle missing output, invalid JSON and process failures separately.

In a multi-file JSON run, a read or compilation error in any later file produces one error document, not a partial success report. Earlier per-file results are not returned in that case. In contrast, a requested quality gate failing after successful compilation retains the complete file list and summary with `ok: true` and `gate.passed: false`. Always inspect both the process exit code and this distinction.

To hand the result to another tool, use `--css`:

```bash
npx adaptive-matrix src/app.css --css > out.css
```

This is shell redirection, not an atomic file-writing feature. The shell can truncate an existing `out.css` before compilation starts. Never redirect to an input file. Multi-file CSS output can also be partial if a later input fails, and a failed quality gate still emits CSS. For build artifacts, capture stdout in a temporary file, require exit code `0`, then replace the destination; retain the previous artifact on failure. Use the [programmatic API](./api.md) if your build needs to validate the result before deciding how to write it.

In `--css` mode stdout contains stylesheet text only; compiler warnings, continuity findings and browser-compatibility evidence go to stderr, including the details behind a failed quality gate.

Per-file CSS and comparison output respect stdout backpressure: when the downstream buffer fills, the CLI waits before processing the next input. A close or error while waiting fails the command and removes the temporary listeners. This is not constant-memory compilation: each stylesheet is still read and parsed in full, and JSON reports are accumulated before serialization. Bytes already delivered cannot be rolled back after a downstream failure.

Multiple inputs are compiled independently and streamed in argument order, separated by newlines. This is not bundling: imports are not resolved or moved, relative URLs are not rebased, and per-file foundations are not deduplicated. Do not assume concatenated output preserves the behavior of separately loaded stylesheets. Use one input per output artifact or let your build tool perform bundling and asset resolution.

## Reading the output

JSON reports, help text and the final batch summary also wait for stdout backpressure. If writing a JSON report fails, the CLI reports the output error on stderr instead of attempting to append another JSON object to the broken stream.

- `16px → clamp(...)` — converted
- a grey line with no arrow — left as authored (only shown with `--all`). Hairlines, lengths inside `@font-face`, and declarations marked by an ignore comment appear here
- `+ ...` — a declaration the compiler added, such as the root foundation or a `preserveOriginal` fallback
- `@media (min-width: 768px) › .page` — where the declaration sits, outermost first. This is what `@adaptive pc` compiles to, and seeing the same `.page` twice is normal
- `warning ...` — a compiler warning, passed through verbatim
- `shrinks ...` — a size going backwards across a breakpoint, see [Going backwards at a breakpoint](#going-backwards-at-a-breakpoint)
- `needs ...` — syntax a target browser cannot read; only with `--targets`, see [Syntax your target browsers cannot read](#syntax-your-target-browsers-cannot-read)

The header's `+5 library canvases` are the canvases of the built-in component libraries. They are generated from the registry and are not names you can write in `@adaptive`, so only the count is reported. For the full list see [Component libraries](./libraries.md).
