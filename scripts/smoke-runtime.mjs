import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

import postcss from 'postcss'

const esm = await import('../dist/index.js')
assert.equal(typeof esm.default, 'function')
assert.equal(typeof esm.appPcPreset, 'function')
assert.equal(typeof esm.auditCompatibility, 'function')

const compiled = await postcss([
  esm.default({
    profiles: { app: { designWidth: 400, fluid: { maxWidth: 600 } } },
    libraries: false,
    unitToConvert: ['px', 'rem'],
    hairline: 0,
  }),
]).process(String.raw`.a { width: 16p\78; margin: 2rem }`, { from: 'smoke.css' })
assert.match(compiled.css, /width: min\(4vw, 24px\)/)
assert.match(compiled.css, /margin: min\(8vw, 48px\)/)

const require = createRequire(import.meta.url)
const cjs = require('../dist/index.cjs')
assert.equal(typeof cjs, 'function')
assert.equal(cjs.default, cjs)
assert.equal(cjs.postcss, true)

const runtime = await import('../dist/runtime.js')
assert.equal(typeof runtime.observeAdaptiveViewport, 'function')
assert.equal(runtime.observeAdaptiveViewport().update(), null)

const cli = spawnSync(process.execPath, ['dist/cli.js', '--help'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
assert.equal(cli.status, 0, cli.stderr)
assert.match(cli.stdout, /adaptive-matrix/)
assert.match(cli.stdout, /--option=value/)

process.stdout.write(`OK: runtime smoke passed on ${process.version}\n`)
