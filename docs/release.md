# Release and compatibility

**English** · [简体中文](./release.zh-CN.md)

## The release gate

```bash
npm ci
npm run check
npm run pack:check
```

`check` must pass TypeScript, coverage, the tests and the ESM/CJS build together. The coverage gate is 80% for lines/functions/statements and 75% for branches.

## Artifacts

- `dist/index.js` / `dist/index.cjs`: the PostCSS plugin, the presets and the type helpers;
- `dist/runtime.js` / `dist/runtime.cjs`: the optional VisualViewport observer;
- matching `.d.ts` files and sourcemaps.

## Browser policy

The compiler runs on Node.js; browsers only ever receive CSS. The default output depends on `clamp()`, and container profiles additionally depend on container query units. Sacrificing modern capabilities for every user in the name of a hypothetical old environment is not recommended.

Whether your real target browsers can read your output does not have to be estimated:

```bash
npx adaptive-matrix src/app.css -c adaptive.config.mjs --targets "ios_saf 13, chrome 90"
```

Every piece of syntax in the output beyond your targets is listed, along with what is lost when it is unsupported and the switch that turns it off. For the full feature × version matrix see [Browser support and degradation](./compatibility.md).

## Versioning policy

- patch: fixes to conversion, types or documentation, with no change to default output semantics;
- minor: new optional profiles, strategies or runtime variables;
- major: a change to the default formula, the directives, the output order, or the minimum runtime.
