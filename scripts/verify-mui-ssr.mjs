import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import postcss from 'postcss'

// Use a separately installed React/MUI/Emotion environment, never install here.
assert.equal(process.argv.length, 3, 'Usage: npm run verify:mui-ssr -- <dependency-directory>')
const directory = resolve(process.argv[2])
assert.ok(existsSync(join(directory, 'package.json')), 'Dependency directory needs package.json')
const require = createRequire(join(directory, 'package.json'))
const React = require('react')
const { renderToString } = require('react-dom/server')
const { CacheProvider } = require('@emotion/react')
const createCache = require('@emotion/cache').default
const createServer = require('@emotion/server/create-instance').default
const Button = require('@mui/material/Button').default
const TextField = require('@mui/material/TextField').default
const Card = require('@mui/material/Card').default
const { ThemeProvider, createTheme } = require('@mui/material/styles')
const built = new URL('../dist/index.js', import.meta.url)
assert.ok(existsSync(built), 'Build the compiler first: npm run build')
const { default: adaptive } = await import(built.href)
const reports = []
for (const mode of ['light', 'dark']) {
  const cache = createCache({ key: 'css' })
  const server = createServer(cache)
  const html = renderToString(
    React.createElement(
      CacheProvider,
      { value: cache },
      React.createElement(
        ThemeProvider,
        { theme: createTheme({ palette: { mode } }) },
        React.createElement(
          Card,
          null,
          React.createElement(
            Button,
            { variant: 'contained', disabled: mode === 'dark' },
            'Confirm',
          ),
          React.createElement(TextField, {
            label: 'Name',
            defaultValue: 'Example',
            error: mode === 'dark',
          }),
        ),
      ),
    ),
  )
  assert.ok(html.includes('Confirm') && html.includes('Example'), 'Sample did not render')
  for (const component of ['MuiButton-root', 'MuiTextField-root', 'MuiCard-root']) {
    assert.ok(html.includes(component), `Missing rendered component: ${component}`)
  }
  if (mode === 'dark') {
    assert.ok(html.includes('Mui-disabled'), 'Disabled state did not render')
    assert.ok(html.includes('Mui-error'), 'Error state did not render')
  }
  const chunks = server.extractCriticalToChunks(html)
  const css = chunks.styles.map((style) => style.css).join('\n')
  let rules = 0
  postcss.parse(css).walkRules(() => {
    rules++
  })
  assert.ok(rules > 0, 'Emotion produced no CSS rules')
  const from = 'node_modules/@mui/material/ssr.css'
  const first = await postcss([adaptive()]).process(css, { from })
  assert.equal(first.css, css, 'Default routing changed MUI SSR CSS')
  assert.equal(first.warnings().length, 0)
  const second = await postcss([adaptive()]).process(first.css, { from })
  assert.equal(second.css, css, 'SSR output is not idempotent')
  assert.equal(second.warnings().length, 0)
  reports.push({
    library: '@mui/material',
    version: require('@mui/material/package.json').version,
    react: require('react/package.json').version,
    emotion: require('@emotion/react/package.json').version,
    mode,
    components: ['Button', 'TextField', 'Card'],
    rules,
    styleBlocks: chunks.styles.length,
    cssBytes: Buffer.byteLength(css),
    preserved: true,
    idempotent: true,
    scope: 'SSR sample only; no browser interaction, hydration or whole-library certification',
  })
}
console.log(JSON.stringify(reports, null, 2))
