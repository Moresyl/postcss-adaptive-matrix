/** Verify eager JavaScript dependency graphs without launching a browser. */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../docs/.vitepress/dist/', import.meta.url))
const base = process.env.DOCS_BASE ?? '/postcss-adaptive-matrix/'
const dependencies = new Map()
function imports(file) {
  if (dependencies.has(file)) return dependencies.get(file)
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
  const targets = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (!specifier || !ts.isStringLiteral(specifier)) continue
    assert.ok(specifier.text.startsWith('.'), `Unexpected eager import: ${specifier.text}`)
    targets.push(resolve(dirname(file), specifier.text))
  }
  dependencies.set(file, targets)
  return targets
}

let pages = 0
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      check(file)
      continue
    }
    if (!file.endsWith('.html')) continue
    pages++
    const html = readFileSync(file, 'utf8')
    const queue = []
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
      const tag = match[0]
      if (!/\b(?:type="module"|rel="modulepreload")/.test(tag)) continue
      const url = /\b(?:src|href)="([^"]+)"/.exec(tag)?.[1]
      if (!url) continue
      assert.ok(url.startsWith(base), `Unexpected module URL in ${file}: ${url}`)
      queue.push(resolve(root, url.slice(base.length)))
    }
    assert.ok(queue.length, `No module entrypoints found in ${file}`)
    const seen = new Set()
    while (queue.length) {
      const module = queue.pop()
      if (seen.has(module)) continue
      seen.add(module)
      assert.doesNotMatch(
        relative(root, module),
        /@localSearchIndex|VPLocalSearchBox|compiler\.worker|Playground\./,
        `Interactive-only code loaded eagerly by ${relative(root, file)}`,
      )
      queue.push(...imports(module))
    }
  }
}
check(root)
assert.ok(pages > 0, 'No built documentation pages found')
console.log(`OK: ${pages} pages keep search and playground code out of eager module graphs.`)
