import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
// Exercise the public export map, not only the generated files behind it.
const manifest = require('../package.json')
assert.equal((await import(manifest.name)).default, esm.default)
assert.equal(require(manifest.name), cjs)
assert.equal(require(`${manifest.name}/package.json`).version, manifest.version)
const publicRuntime = await import(`${manifest.name}/runtime`)
const commonJsRuntime = require(`${manifest.name}/runtime`)
for (const api of [publicRuntime, commonJsRuntime]) {
  assert.equal(typeof api.observeAdaptiveViewport, 'function')
  assert.equal(api.observeAdaptiveViewport().update(), null)
  const events = new Map()
  const frames = new Map()
  const values = new Map()
  let handle = 0
  let writes = 0
  const host = {
    innerWidth: 390,
    innerHeight: 800,
    addEventListener(name, listener) {
      events.set(name, listener)
    },
    removeEventListener(name, listener) {
      assert.equal(events.get(name), listener)
      events.delete(name)
    },
    requestAnimationFrame(callback) {
      const id = handle++
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrame(id) {
      frames.delete(id)
    },
  }
  const observer = api.observeAdaptiveViewport({
    window: host,
    target: {
      style: {
        setProperty(name, value) {
          writes++
          values.set(name, value)
        },
      },
    },
  })
  try {
    assert.equal(writes, 7)
    assert.equal(values.get('--adaptive-vh'), '8px')
    observer.update()
    assert.equal(writes, 7)
    host.innerHeight = 600
    events.get('resize')()
    events.get('orientationchange')()
    assert.equal(frames.size, 1)
    for (const [id, callback] of frames) {
      frames.delete(id)
      callback()
    }
    assert.equal(values.get('--adaptive-layout-height'), '600')
    assert.equal(values.get('--adaptive-vh'), '6px')
    assert.equal(writes, 10)
    events.get('resize')()
    assert.equal(frames.size, 1)
  } finally {
    observer.destroy()
  }
  observer.destroy()
  assert.equal(events.size, 0)
  assert.equal(frames.size, 0)
  assert.equal(observer.update(), null)
  assert.equal(writes, 10)
}
for (const api of [esm, cjs]) {
  const sparseLibraries = new Array(2)
  sparseLibraries[0] = 'vant'
  assert.throws(
    () => api.defineLibraries(sparseLibraries),
    /A library entry must be a built-in name or options object, not undefined/,
  )
  for (const filter of ['include', 'exclude']) {
    const files = [filter === 'include' ? 'card.css' : 'vendor.css']
    const reusable = api.createAdaptiveCompiler({
      profiles: { app: 400 },
      libraries: false,
      [filter]: files,
    })
    files.splice(0, 1, filter === 'include' ? 'vendor.css' : 'card.css')
    const captured = await reusable('.card { padding: 40px }', {
      process: { from: 'src/card.css' },
    })
    assert.match(captured.css, /10vw/, `${filter} must be captured by the built compiler`)
    assert.deepEqual(captured.warnings, [])
  }
  const escapedMedia = postcss.parse(
    '.a { width: 10vw } @media (min-width: 768px) { .a { width: 5vw } }',
  )
  escapedMedia.walkAtRules('media', (rule) => {
    rule.name = String.raw`m\65 dia`
  })
  assert.equal(api.findContinuityIssues(escapedMedia).length, 1)
  const registration = postcss.parse(
    '@property --gap { syntax: "<length>"; inherits: false; initial-value: 24px }' +
      '.a { width: var(--gap, 10vw) } @media (min-width: 768px) { .a { width: 5vw } }',
  )
  registration.walkAtRules('property', (rule) => {
    rule.name = String.raw`pr\6f perty`
  })
  assert.deepEqual(api.findContinuityIssues(registration), [])
  const seam = api.findContinuityIssues(
    postcss.parse('.a { width: 10vw } @media (min-width: 768px) { .a { width: 5vw } }'),
  )
  assert.equal(seam.length, 1)
  assert.equal(seam[0].breakpoint, 768)
  for (const invalid of ['10vw / 2', 'calc((16px()']) {
    assert.deepEqual(
      api.findContinuityIssues(
        postcss.parse(`.a { width: 10vw } @media (min-width: 768px) { .a { width: 2px } }`),
      ).length,
      1,
    )
    const root = postcss.parse('.a { width: 10vw } @media (min-width: 768px) { .a { width: 2px } }')
    root.nodes[1].nodes[0].nodes[0].value = invalid
    assert.deepEqual(api.findContinuityIssues(root), [])
  }
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

const version = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), '--version'],
  {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 15000,
  },
)
assert.equal(version.status, 0, version.stderr)
assert.equal(version.stdout, `${require('../package.json').version}\n`)

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
