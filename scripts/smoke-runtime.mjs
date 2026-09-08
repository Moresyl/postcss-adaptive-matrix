import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
for (const api of [esm, cjs]) {
  const frozen = Object.freeze(/desktop/g)
  const routed = await api.compileAdaptiveCss(
    '.card { padding: 24px }',
    {
      defaultProfile: 'app',
      profiles: { app: 375, pc: 750 },
      routes: [{ file: frozen, profile: 'pc' }],
    },
    { process: { from: 'desktop.css' } },
  )
  assert.match(routed.css, /3\.2vw/)
  assert.equal(frozen.lastIndex, 0)
  const document = postcss.document()
  document.append(postcss.parse('.a { width: min(40px, 100vw) }'))
  document.append(postcss.parse('@media (min-width: 768px) { .a { width: min(20px, 100vw) } }'))
  assert.deepEqual(api.findContinuityIssues(document), [])
  assert.throws(() => api.findContinuityIssues(document, 0), RangeError)
  const compile = api.createAdaptiveCompiler({ profiles: { app: 375 } })
  const output = await compile('.card { padding: 24px }', {
    process: {
      from: 'src/card.css',
      to: 'dist/card.css',
      map: { inline: false, annotation: false },
    },
  })
  assert.match(output.css, /6\.4vw/)
  assert.equal(output.map.toJSON().sourcesContent[0], '.card { padding: 24px }')
  assert.equal(output.compatibility, null)
  const single = await api.compileAdaptiveCss('.card { padding: 24px }')
  assert.match(single.css, /6\.4vw/)
  const gated = await api.compileAdaptiveCss(
    '.card { padding: 24px }',
    {},
    {
      targets: { safari: 12 },
      failOn: ['compatibility'],
    },
  )
  assert.equal(gated.gate.passed, false)
  assert.match(gated.css, /6\.4vw/)
}

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

const secret = 'smoke-private-config-48392'
const configDirectory = mkdtempSync(join(tmpdir(), 'adaptive-cli-smoke-'))
try {
  const config = join(configDirectory, 'broken.json')
  for (const source of [`{ "token": "${secret}" invalid }`, secret]) {
    writeFileSync(config, source)
    const malformed = spawnSync(process.execPath, ['dist/cli.js', '--config', config, '--json'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      timeout: 15_000,
    })
    assert.equal(malformed.status, 1, malformed.stderr)
    assert.equal(JSON.parse(malformed.stdout).ok, false)
    assert.match(malformed.stdout, /Invalid JSON syntax/)
    assert.ok(!(malformed.stdout + malformed.stderr).includes('smoke-private'))
    assert.ok(!(malformed.stdout + malformed.stderr).includes('"token"'))
  }
} finally {
  rmSync(configDirectory, { recursive: true, force: true })
}

process.stdout.write(`OK: runtime smoke passed on ${process.version}\n`)
