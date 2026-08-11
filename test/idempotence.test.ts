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
 * `rem + vw`; the `vw` is what tells a second pass the value is already
 * compiled. Take it away — `fontFluidity: 0` — and `font-size: 32px` becomes a
 * bare `font-size: 2rem`, which the next pass reads as a design length and
 * converts all over again.
 *
 * It survives, but not because anything defends it: `rootValue` is used at both
 * ends, so 32 ÷ 16 written and 2 × 16 read are exact inverses and the value is
 * its own fixed point. That is a property of the arithmetic rather than a rule
 * anybody wrote down, which is precisely why it wants a test. Change either end
 * of that division and the failure is silent — no error, no warning, just text
 * that shrinks a little more on every save in a watch loop.
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
})
