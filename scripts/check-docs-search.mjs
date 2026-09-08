/** Offline production-index smoke test; no browser or network required. */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Resolve the same MiniSearch version as VitePress, including nested installs.
const require = createRequire(import.meta.url)
const vitepressRequire = createRequire(require.resolve('vitepress/package.json'))
const MiniSearch = vitepressRequire('minisearch')
const chunks = new URL('../docs/.vitepress/dist/assets/chunks/', import.meta.url)
const files = readdirSync(chunks)
const searchFile = files.find((file) => /^VPLocalSearchBox\..*\.js$/.test(file))
assert.ok(searchFile, 'Built local-search component is missing')
const client = readFileSync(new URL(searchFile, chunks), 'utf8')
const basePath = process.env.DOCS_BASE ?? '/postcss-adaptive-matrix/'
const pages = new Map()
let sections = 0
for (const locale of ['root', 'zh']) {
  const indexFile = files.find(
    (file) => file.startsWith(`virtual_adaptive-search-${locale}.`) && file.endsWith('.js'),
  )
  assert.ok(indexFile, `Built ${locale} search index is missing`)
  assert.ok(client.includes(indexFile), 'Search client does not reference the built index')
  const { default: json } = await import(new URL(indexFile, chunks).href)
  const index = MiniSearch.loadJSON(json, {
    fields: ['title', 'titles', 'text'],
    storeFields: ['title', 'titles'],
    searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } },
  })
  const results = index.search('compileAdaptiveCss')
  for (const route of [locale === 'zh' ? '/zh/docs/api#' : '/docs/api#']) {
    assert.ok(
      results.some((result) => result.id.includes(route)),
      `API query did not return ${route}`,
    )
  }
  for (const id of Object.values(JSON.parse(json).documentIds)) {
    const [route, fragment] = id.split('#')
    assert.ok(route.startsWith(basePath), `Search result is outside the site base: ${id}`)
    const relative = route.slice(basePath.length)
    assert.equal(relative.startsWith('zh/'), locale === 'zh', `Wrong search locale: ${id}`)
    const page = relative.endsWith('/') || !relative ? `${relative}index.html` : `${relative}.html`
    if (!pages.has(page)) {
      pages.set(
        page,
        readFileSync(new URL(`../docs/.vitepress/dist/${page}`, import.meta.url), 'utf8'),
      )
    }
    const anchor = decodeURIComponent(fragment ?? '')
    assert.ok(anchor && pages.get(page).includes(`id="${anchor}"`), `Missing search anchor: ${id}`)
  }
  if (locale === 'zh')
    assert.ok(
      index.search('程序化').some((result) => result.id.includes('/zh/docs/api#')),
      'Chinese title query did not return the Chinese API page',
    )
  sections += index.documentCount
}
console.log(
  `OK: ${sections} search sections across ${pages.size} pages; anchors, bilingual queries and separate lazy locale indexes.`,
)
