import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { EVERY_WIDTH, allMatch, bandOf, boundaryOf, narrow } from '../src/core/media.js'
import adaptiveMatrix from '../src/index.js'
import type { AdaptiveMatrixOptions } from '../src/index.js'

/**
 * A responsive stylesheet's breakpoints, and the canvas each one was drawn on.
 *
 * One file, two design files: the phone numbers were measured on a 750 mock and
 * the numbers inside `@media (min-width: 1024px)` on a 1440 one. Nothing in the
 * CSS says so, and compiling the whole file against one canvas is not a near
 * miss — the desktop rule only applies from 1024px up, which is past where the
 * phone canvas stops scaling, so every `clamp()` in it is pinned to its bound.
 * The compiler runs, the output looks compiled, and not one value moves.
 */

const profiles = {
  app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
  pc: { designWidth: 1440, fluid: { minWidth: 1024, maxWidth: 1920 } },
}
const base: AdaptiveMatrixOptions = { defaultProfile: 'app', profiles }
const routed: AdaptiveMatrixOptions = {
  ...base,
  routes: [{ media: { minWidth: 1024 }, profile: 'pc' }],
}

async function run(css: string, options: AdaptiveMatrixOptions) {
  const result = await postcss([adaptiveMatrix(options)]).process(css, {
    from: '/project/src/app.css',
  })
  return { css: result.css, warnings: result.warnings().map((warning) => warning.text) }
}

describe('bandOf', () => {
  it('reads the widths a query is live in', () => {
    expect(bandOf('(min-width: 1024px)')).toEqual({ lo: 1024, hi: Infinity })
    expect(bandOf('(max-width: 767px)')).toEqual({ lo: 0, hi: 767 })
    expect(bandOf('(min-width: 768px) and (max-width: 1023px)')).toEqual({ lo: 768, hi: 1023 })
    expect(bandOf('screen and (min-width: 1024px)')).toEqual({ lo: 1024, hi: Infinity })
  })

  it('resolves rem and em against the initial font size, not rootValue', () => {
    // A media query is evaluated before any declaration could change font-size,
    // so its relative units cannot depend on the cascade they select. 64rem is
    // 1024px even in a stylesheet whose html is 62.5%. Utility frameworks write
    // every breakpoint this way, so reading only px would have left Tailwind
    // and UnoCSS projects unreadable.
    expect(bandOf('(min-width: 64rem)')).toEqual({ lo: 1024, hi: Infinity })
    expect(bandOf('(min-width: 64em)')).toEqual({ lo: 1024, hi: Infinity })
    expect(bandOf('(max-width: 47.9375rem)')).toEqual({ lo: 0, hi: 767 })
  })

  it('refuses to answer for a query it cannot read', () => {
    // Not "no constraint" — unknown. Treating these as unconstrained would route
    // rules on a condition nobody checked.
    expect(bandOf('print')).toBeNull()
    expect(bandOf('(min-width: 1024px), print')).toBeNull()
    expect(bandOf('not all and (min-width: 1024px)')).toBeNull()
    expect(bandOf('(orientation: landscape)')).toBeNull()
    expect(bandOf('(min-width: 40vw)')).toBeNull()
  })

  it('treats a condition it cannot read as not holding, rather than as holding', () => {
    // `allMatch` and `boundaryOf` are asked about one condition at a time, by
    // callers that walk queries `bandOf` has already accepted as a whole. The
    // safe answer for an unreadable one is still "no": a diagnostic that
    // assumed an unknown condition were true would report cascades that never
    // happen, which is worse than reporting none.
    expect(allMatch(['(orientation: landscape)'], 1200)).toBe(false)
    expect(allMatch(['(min-width: 1024px)', '(hover: hover)'], 1200)).toBe(false)
    expect(allMatch(['(min-width: 1024px)', '(max-width: 1600px)'], 1200)).toBe(true)
    expect(allMatch(['(min-width: 1024px)'], 900)).toBe(false)
    expect(allMatch(['(max-width: 1024px)'], 900)).toBe(true)

    expect(boundaryOf('(min-width: 64rem)')).toBe(1024)
    expect(boundaryOf('(max-width: 767px)')).toBe(767)
    expect(boundaryOf('(orientation: landscape)')).toBeNull()
  })

  it('narrows by conjunction, because nesting is conjunction', () => {
    expect(narrow(EVERY_WIDTH, { lo: 1024, hi: Infinity })).toEqual({ lo: 1024, hi: Infinity })
    expect(narrow({ lo: 900, hi: Infinity }, { lo: 1100, hi: 1400 })).toEqual({
      lo: 1100,
      hi: 1400,
    })
  })
})

describe('a media route', () => {
  const breakpoint = '@media (min-width: 1024px) { .hero { padding: 40px } }'

  it('compiles a breakpoint against the design file it was drawn on', async () => {
    const { css } = await run(breakpoint, routed)
    // 40 / 1440, bounded by pc's own 1024–1920 rather than the phone's 320–600.
    expect(css).toContain('clamp(28.44444px, 2.77778vw, 53.33333px)')
  })

  it('leaves everything outside the band on the default canvas', async () => {
    const { css } = await run(`.hero { padding: 16px }\n${breakpoint}`, routed)
    expect(css).toContain('clamp(6.82667px, 2.13333vw, 12.8px)')
  })

  it('matches by implication, not by how the query was spelled', async () => {
    for (const params of [
      'screen and (min-width: 1200px)',
      '(min-width: 64rem)',
      '(min-width: 1024px) and (max-width: 1600px)',
    ]) {
      const { css } = await run(`@media ${params} { .a { padding: 40px } }`, routed)
      expect(css, params).toContain('2.77778vw')
    }
  })

  it('applies through nested queries', async () => {
    const { css } = await run(
      '@media (min-width: 900px) { @media (min-width: 1100px) { .a { padding: 40px } } }',
      routed,
    )
    expect(css).toContain('2.77778vw')
  })

  it('does not claim a band wider than it asked for', async () => {
    const { css } = await run('@media (min-width: 700px) { .a { padding: 40px } }', routed)
    expect(css).toContain('5.33333vw')
  })

  it('claims nothing when the query cannot be read', async () => {
    for (const params of ['print and (min-width: 1024px)', '(min-width: 1024px), print']) {
      const { css } = await run(`@media ${params} { .a { padding: 40px } }`, routed)
      expect(css, params).toContain('5.33333vw')
    }
  })

  it('ignores a container query, which bounds an element rather than the viewport', async () => {
    // `vw` has never been about the element, so a container's width says nothing
    // about which design file a length came from.
    const { css } = await run('@container (min-width: 1024px) { .a { padding: 40px } }', routed)
    expect(css).toContain('5.33333vw')
  })

  it('loses to a selector route, because a library is drawn on its own canvas at every width', async () => {
    const options = { ...routed, libraries: ['vant'] as const }
    const { css } = await run('@media (min-width: 1024px) { .van-cell { padding: 40px } }', options)
    expect(css).toContain('10.66667vw')
  })

  it('can name a selector and a band together, which is how a breakpoint override is said', async () => {
    const options: AdaptiveMatrixOptions = {
      ...base,
      libraries: ['vant'],
      routes: [{ selector: ['.van-'], media: { minWidth: 1024 }, profile: 'pc' }],
    }
    const { css } = await run('@media (min-width: 1024px) { .van-cell { padding: 40px } }', options)
    expect(css).toContain('2.77778vw')
    const outside = await run('.van-cell { padding: 40px }', options)
    expect(outside.css).toContain('10.66667vw')
  })
})

describe('the dead-band warning', () => {
  it('reports a breakpoint whose lengths cannot move', async () => {
    const { warnings } = await run('@media (min-width: 1024px) { .a { padding: 40px } }', base)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('live from 1024px up')
    expect(warnings[0]).toContain('pinned to its maximum')
    expect(warnings[0]).toContain('{ media: { minWidth: 1024 }, profile')
  })

  it('reports a band that sits below where the canvas starts scaling', async () => {
    const { warnings } = await run('@media (max-width: 300px) { .a { padding: 40px } }', base)
    expect(warnings[0]).toContain('between 0px and 300px')
    expect(warnings[0]).toContain('pinned to its minimum')
    expect(warnings[0]).toContain('maxWidth: 300')
  })

  it('says so once per canvas per band, not once per rule', async () => {
    const { warnings } = await run(
      '@media (min-width: 1024px) { .a { padding: 40px } .b { margin: 8px } }\n' +
        '@media (min-width: 1024px) { .c { margin: 8px } }',
      base,
    )
    expect(warnings).toHaveLength(1)
  })

  it('asks for a selector when a selector route chose the canvas', async () => {
    // A bare media route would not change this rule: a selector route outranks
    // one, so advice that omitted the selector would change nothing.
    const { warnings } = await run('@media (min-width: 1024px) { .van-cell { padding: 40px } }', {
      ...base,
      libraries: ['vant'],
    })
    expect(warnings[0]).toContain('{ selector: […], media:')
  })

  it('stays quiet once the breakpoint has a canvas that reaches it', async () => {
    const { warnings } = await run('@media (min-width: 1024px) { .a { padding: 40px } }', routed)
    expect(warnings).toEqual([])
  })

  it('stays quiet for bare viewport lengths, which have no bounds to fall outside', async () => {
    const { warnings } = await run('@media (min-width: 1024px) { .a { padding: 40px } }', {
      ...base,
      strategy: 'viewport',
    })
    expect(warnings).toEqual([])
  })

  it('stays quiet where the band and the canvas overlap', async () => {
    const { warnings } = await run('@media (min-width: 400px) { .a { padding: 40px } }', base)
    expect(warnings).toEqual([])
  })

  it('stays quiet when nothing in the block is converted', async () => {
    const { warnings } = await run('@media (min-width: 1024px) { .a { color: red } }', base)
    expect(warnings).toEqual([])
  })
})

describe('a media route with no usable band', () => {
  const reject = (media: unknown) =>
    postcss([adaptiveMatrix({ ...base, routes: [{ media: media as never, profile: 'pc' }] })])

  it('refuses an empty band, which would silently replace defaultProfile', () => {
    expect(() => reject({})).toThrow(/needs minWidth, maxWidth or both/)
  })

  it('refuses a reversed band, which can never match', () => {
    expect(() => reject({ minWidth: 1024, maxWidth: 600 })).toThrow(/can never match/)
  })

  it('refuses a bound that is not a width', () => {
    expect(() => reject({ minWidth: '1024px' })).toThrow(/must be a width in pixels/)
    expect(() => reject({ maxWidth: -1 })).toThrow(/must be a width in pixels/)
  })
})
