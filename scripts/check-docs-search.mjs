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
assert.match(client, /zh:\w+\.zh\?\?\w+\.root/, 'Chinese search fallback is missing')
const indexFile = files.find((file) => /^@localSearchIndexroot\..*\.js$/.test(file))
assert.ok(indexFile, 'Built shared search index is missing')
assert.ok(client.includes(indexFile), 'Search client does not reference the built index')
const { default: json } = await import(new URL(indexFile, chunks).href)
const index = MiniSearch.loadJSON(json, {
  fields: ['title', 'titles', 'text'],
  storeFields: ['title', 'titles'],
  searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } },
})
const results = index.search('compileAdaptiveCss')
for (const route of ['/docs/api#', '/zh/docs/api#']) {
  assert.ok(
    results.some((result) => result.id.includes(route)),
    `API query did not return ${route}`,
  )
}
assert.ok(
  index.search('程序化').some((result) => result.id.includes('/zh/docs/api#')),
  'Chinese title query did not return the Chinese API page',
)
console.log(
  `OK: ${index.documentCount} search sections; bilingual API queries and locale fallback.`,
)
