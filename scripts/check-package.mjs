import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this check with npm run pack:check.')
const result = spawnSync(
  process.execPath,
  [npm, 'pack', '--dry-run', '--json', '--ignore-scripts'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
if (result.error) throw result.error
if (result.status !== 0) {
  console.error(result.stderr || 'Package inspection failed.')
  process.exit(1)
}
const [pack] = JSON.parse(result.stdout)
const files = new Set(pack.files.map((file) => file.path))
const targets = new Set(['README.md', 'README.zh-CN.md', 'LICENSE'])
function collect(value) {
  if (typeof value === 'string') targets.add(value.replace(/^\.\//, ''))
  else if (value && typeof value === 'object') Object.values(value).forEach(collect)
}
collect(manifest.exports)
collect(manifest.bin)
for (const field of ['main', 'module', 'types']) collect(manifest[field])
const missing = [...targets].filter((target) => !files.has(target))
if (missing.length) {
  console.error(
    `Package is missing required files: ${missing.join(', ')}. Run npm run build first.`,
  )
  process.exit(1)
}
const allowed = new Set([...targets, 'package.json'])
for (const target of targets) {
  if (/\.(?:js|cjs)$/.test(target)) allowed.add(`${target}.map`)
}
const unexpected = [...files].filter((file) => !allowed.has(file))
if (unexpected.length) {
  console.error(`Package contains undeclared files: ${unexpected.join(', ')}.`)
  process.exit(1)
}
for (const file of files) {
  if (!file.endsWith('.map')) continue
  const map = JSON.parse(readFileSync(new URL(file, root), 'utf8'))
  const absolute = (value) => /^(?:[A-Za-z]:|\/|\\|[A-Za-z][A-Za-z\d+.-]*:)/.test(value)
  if (
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    map.sources.length === 0 ||
    map.sources.some((source) => typeof source !== 'string' || absolute(source)) ||
    (map.sourceRoot && absolute(map.sourceRoot)) ||
    !Array.isArray(map.sourcesContent) ||
    map.sourcesContent.length !== map.sources.length ||
    map.sourcesContent.some((source) => typeof source !== 'string')
  ) {
    throw new Error(`Package source map is not self-contained and portable: ${file}`)
  }
}
console.log(
  `OK: ${manifest.name}@${manifest.version}, ${files.size} files; all declared entrypoints included.`,
)
