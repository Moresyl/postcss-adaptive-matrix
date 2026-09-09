import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import postcss from 'postcss'

// Optional integration check: no downloads and no changes to project dependencies.
const root = new URL('../', import.meta.url)
const bundle = new URL('.libcheck/naive-ui/package/dist/index.js', root)
const built = new URL('dist/index.js', root)
assert.ok(existsSync(bundle), 'Cache Naive UI first: npm run verify:libraries -- naive-ui')
assert.ok(existsSync(built), 'Build the compiler first: npm run build')
const require = createRequire(import.meta.url)
const naive = require(fileURLToPath(bundle))
const manifest = JSON.parse(
  readFileSync(new URL('.libcheck/naive-ui/package/package.json', root), 'utf8'),
)
assert.equal(manifest.name, 'naive-ui')
const { default: adaptive } = await import(built.href)
const context = { styles: [], ids: new Set() }
const app = createSSRApp({
  render: () =>
    h(naive.NSpace, null, {
      default: () => [
        h(naive.NButton, { type: 'primary' }, { default: () => 'Confirm' }),
        h(naive.NInput, { value: 'Example' }),
        h(naive.NCard, { title: 'Card' }, { default: () => 'Content' }),
      ],
    }),
})
// Matches the adapter contract bundled in the cached Naive UI distribution.
app.provide('@css-render/vue3-ssr', context)
const html = await renderToString(app)
assert.ok(html.includes('Confirm'))
assert.ok(context.styles.length > 0, 'SSR adapter collected no styles')
const css = context.styles
  .map((style) => {
    const match = /^<style\b[^>]*>([\s\S]*)<\/style>$/.exec(style)
    assert.ok(match, 'Unexpected SSR style envelope')
    return match[1]
  })
  .join('\n')
const parsed = postcss.parse(css)
let rules = 0
parsed.walkRules(() => {
  rules++
})
assert.ok(rules > 0, 'SSR output contains no CSS rules')
// NSpace uses inline layout styles rather than a collected stylesheet.
assert.ok(html.includes('n-space'), 'Missing rendered NSpace wrapper')
for (const prefix of ['.n-button', '.n-input', '.n-card']) {
  assert.ok(css.includes(prefix), `Missing generated component styles: ${prefix}`)
}
const from = 'node_modules/naive-ui/ssr.css'
const first = await postcss([adaptive()]).process(css, { from })
assert.equal(first.css, css, 'Default routing changed Naive UI SSR styles')
assert.equal(first.warnings().length, 0)
const second = await postcss([adaptive()]).process(first.css, { from })
assert.equal(second.css, first.css, 'SSR styles are not idempotent')
assert.equal(second.warnings().length, 0)
console.log(
  JSON.stringify(
    {
      library: manifest.name,
      version: manifest.version,
      cached: true,
      components: ['NSpace', 'NButton', 'NInput', 'NCard'],
      styleBlocks: context.styles.length,
      cssBytes: Buffer.byteLength(css),
      rules,
      preserved: true,
      idempotent: true,
      scope: 'SSR sample only; not browser interaction or whole-library certification',
    },
    null,
    2,
  ),
)
