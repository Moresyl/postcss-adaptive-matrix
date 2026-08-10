# App + desktop example

**English** · [简体中文](./README.zh-CN.md)

Build the compiler once in the repository root, then process `input.css` with any PostCSS runner:

```bash
npm run build
node dist/cli.js examples/app-pc/input.css \
  -c examples/app-pc/adaptive.config.mjs \
  --targets "ios_saf 13, chrome 90"
```

`adaptive.config.mjs` holds the options; `postcss.config.mjs` imports them, so running this through PostCSS instead compiles exactly the same thing. `--targets` is optional and prints the browser-support audit after the table.

What this example shows:

- a 375 app design file and a 1440 desktop design file in one build;
- safe-area variables for notched screens;
- hairline preservation, so a 1px border stays 1px;
- text written as `rem + vw`, so browser zoom still reaches it;
- a root container capped at a maximum width and centred.
