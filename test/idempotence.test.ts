import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix, { withAtomicCss } from '../src/index.js'
import type { AdaptiveMatrixOptions } from '../src/index.js'

/**
 * Compiling compiled output must change nothing.
 *
 * The conformance suite already asserts this for every fixture, but only under
 * the options each fixture happens to declare. What is not covered there is the
 * cross product of the switches that change the *shape* of the output — and the
 * shape is what a second pass has to survive.
 *
 * The combination worth naming is `withAtomicCss` with a static text setting.
 * Atomic mode adds `rem` to `unitToConvert`, and text is normally written as
 * `rem + vw`; the function wrapper tells a second pass the value is already
 * compiled. `fontFluidity: 0` removes the fluid half, so the compiler preserves
 * the same trace as `calc(2rem)`. Without it, a library canvas whose text is
 * restated against the page canvas applies that ratio again on every pass:
 * 2rem silently becomes 4rem.
 *
 * A second pass is not a hypothetical. A package that ships pre-compiled CSS
 * goes through the consuming application's pipeline again; so does anything a
 * framework preset registers twice; so does a monorepo that compiles a shared
 * component library and then compiles the app that imports it.
 */

const base: AdaptiveMatrixOptions = {
  defaultProfile: 'app',
  profiles: { app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } } },
}

const CONFIGURATIONS: [string, AdaptiveMatrixOptions][] = [
  ['defaults', base],
  ['atomic css', withAtomicCss(base)],
  ['atomic css with static text', { ...withAtomicCss(base), fontFluidity: 0 }],
  ['atomic css keeping the original', { ...withAtomicCss(base), preserveOriginal: true }],
  ['keeping the original', { ...base, preserveOriginal: true }],
  ['bare viewport lengths', { ...base, strategy: 'viewport' }],
  ['atomic css, bare viewport lengths', { ...withAtomicCss(base), strategy: 'viewport' }],
  ['a root foundation', { ...base, root: { selector: '#app' } }],
  ['every built-in library', { ...base, libraries: 'auto' }],
]

const STYLESHEETS: [string, string][] = [
  ['a pixel length', '.a { padding: 16px }'],
  ['a text size', '.a { font-size: 32px; line-height: 40px }'],
  ['rem input', '.a { padding: 1rem; font-size: 2rem }'],
  ['a hairline beside a real length', '.a { border: 1px solid red; box-shadow: 0 2px 8px red }'],
  ['a theme token', ':root { --spacing: 0.25rem; --text-lg: 1.125rem }'],
  ['a library rule', '.van-cell { padding: 16px }'],
  ['a length inside calc', '.a { width: calc(100% - 16px) }'],
  ['a negative length', '.a { margin: -16px }'],
]

async function compile(css: string, options: AdaptiveMatrixOptions): Promise<string> {
  const result = await postcss([adaptiveMatrix(options)]).process(css, {
    from: '/project/src/app.css',
  })
  return result.css
}

describe('a second pass over compiled output', () => {
  for (const [configuration, options] of CONFIGURATIONS) {
    for (const [subject, css] of STYLESHEETS) {
      it(`changes nothing: ${subject}, ${configuration}`, async () => {
        const once = await compile(css, options)
        expect(await compile(once, options)).toBe(once)
      })
    }
  }

  it('leaves a static rem text size alone even while reading rem', async () => {
    // The assertion above can only fail if something moves; this one states
    // what shape it is guarding, so it cannot start passing vacuously because
    // the value stopped being converted in the first place.
    const options = { ...withAtomicCss(base), fontFluidity: 0 }
    const once = await compile('.a { font-size: 32px }', options)
    expect(once).toContain('rem')
    expect(once).not.toContain('vw')
    expect(await compile(once, options)).toBe(once)
  })

  it('does not rescale static text routed through a different library canvas', async () => {
    const options = {
      ...withAtomicCss(base),
      fontFluidity: 0,
      libraries: [{ name: 'probe', designWidth: 375, prefix: 'probe-' }],
    } satisfies AdaptiveMatrixOptions
    const once = await compile('.probe-title { font-size: 16px }', options)

    // 16px on the library's 375 canvas is the same design size as 32px on the
    // page's 750 canvas, hence 2rem. A second pass used to anchor that 2rem a
    // second time and silently turn it into 4rem.
    expect(once).toContain('2rem')
    expect(await compile(once, options)).toBe(once)
  })

  it('keeps an unbounded marker stable when the output unit is also readable input', async () => {
    const options = {
      ...base,
      profiles: { app: { designWidth: 750 } },
      unitToConvert: ['px', 'vw'],
    } satisfies AdaptiveMatrixOptions
    const once = await compile('.a { width: 75px }', options)

    expect(once).toContain('calc(10vw)')
    expect(await compile(once, options)).toBe(once)
  })

  it('continues after a precompiled foundation concatenated before app CSS', async () => {
    const options = { ...base, root: { selector: '#app' } }
    const dependency = await compile('.dependency { width: 16px }', options)
    const bundled = `${dependency}\n.app { width: 100px }`
    const result = await compile(bundled, options)

    expect(result).toContain('postcss-adaptive-matrix foundation end')
    expect(result).not.toContain('.app { width: 100px }')
    expect(result).toContain('.app { width: clamp(')
    expect(result.match(/postcss-adaptive-matrix foundation \*\//g)).toHaveLength(1)
  })

  it('conservatively skips old foundation output that has no end marker', async () => {
    const legacy =
      '.before { width: clamp(1px, 2vw, 3px) }\n' +
      '/* postcss-adaptive-matrix foundation */\n' +
      ':where(#app) { width: 100%; max-width: 480px }\n' +
      '.after { width: 100px }'

    expect(await compile(legacy, base)).toBe(legacy)
  })
})
