/** Validate actual build output, not merely the generated-asset writer. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatedAssetMap } from '../docs/.vitepress/generated.js'

const directory = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../docs/.vitepress/dist/', import.meta.url))
const assets = generatedAssetMap()
for (const [name, expected] of assets) {
  assert.equal(
    readFileSync(resolve(directory, name), 'utf8'),
    expected,
    `Stale generated asset: ${name}`,
  )
}
console.log(`OK: ${assets.size} generated documentation assets match their sources.`)

const base = process.env.DOCS_BASE ?? '/postcss-adaptive-matrix/'
let rawLinks = 0
function checkMarkdownLinks(folder: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) checkMarkdownLinks(path)
    else if (entry.name.endsWith('.html')) {
      const html = readFileSync(path, 'utf8')
      for (const match of html.matchAll(/<a\b[^>]*>/g)) {
        const tag = match[0]
        if (!/class="[^"]*\bcopy-page-action\b/.test(tag)) continue
        const href = /href="([^"]+)"/.exec(tag)?.[1]
        if (!href || !href.endsWith('.md')) continue
        assert.ok(
          href.startsWith(base),
          `Raw Markdown link loses deployment base: ${path}: ${href}`,
        )
        assert.ok(
          existsSync(resolve(directory, href.slice(base.length))),
          `Missing raw Markdown target: ${href}`,
        )
        rawLinks++
      }
    }
  }
}
checkMarkdownLinks(directory)
assert.ok(rawLinks > 0, 'No raw Markdown links found in built documentation')
console.log(`OK: ${rawLinks} raw Markdown links retain the deployment base and resolve.`)
