/** Validate actual build output, not merely the generated-asset writer. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
