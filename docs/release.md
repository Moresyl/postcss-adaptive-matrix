# Release and compatibility

**English** · [简体中文](./release.zh-CN.md)

## The release gate

```bash
npm ci
npm run check
npm run pack:check
npm run smoke:runtime
npm run audit:check
```

`check` runs the ESM/CJS build, TypeScript, lint, formatting, documentation links, coverage tests and production documentation build. Coverage thresholds are 98% lines, 98% functions, 97% statements and 92% branches, as configured in `vitest.config.ts`. `prepublishOnly` repeats `check`, package inspection, runtime smoke and the dependency audit; none of the commands above publishes a version.

Run `npm run bench:check` after building when conversion or routing performance changes. `npm run verify:libraries` is an explicit additional check that may download packages and reuse cached versions, not part of the default release gate. Inspect the report's package versions and runtime-only exclusions.

## Artifacts

- `dist/index.js` / `dist/index.cjs`: the PostCSS plugin, programmatic compiler, diagnostic APIs, presets and type helpers;
- `dist/runtime.js` / `dist/runtime.cjs`: the optional VisualViewport observer;
- `dist/cli.js`: the command-line entrypoint;
- matching `.d.ts` (ESM), `.d.cts` (CommonJS) declarations and sourcemaps.

## Browser policy

The compiler runs on Node.js; browsers only ever receive CSS. The default output depends on `clamp()`, and container profiles additionally depend on container query units. Sacrificing modern capabilities for every user in the name of a hypothetical old environment is not recommended.

Audit the tracked features in your output against explicit browser targets:

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

Detected unsupported features from the bundled table are listed with their impact and configuration alternatives. This is not exhaustive CSS validation or a rendering test. For the tracked feature × version matrix and limits see [Browser support and degradation](./compatibility.md).

## Versioning policy

- patch: fixes to conversion, types or documentation, with no change to default output semantics;
- minor: new optional profiles, strategies or runtime variables;
- major: a change to the default formula, the directives, the output order, or the minimum runtime.
