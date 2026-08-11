import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix, { appPcPreset, defineConfig, presets, withAtomicCss } from '../src/index.js'
import type { AdaptiveMatrixOptions } from '../src/index.js'
import { resolveOptions } from '../src/core/options.js'

async function process(
  css: string,
  options: Parameters<typeof adaptiveMatrix>[0] = {},
  from = '/project/src/app.css',
) {
  return postcss([adaptiveMatrix(options)]).process(css, { from })
}

describe('adaptiveMatrix', () => {
  it('converts ordinary rules with bounded fluid lengths and zoomable text', async () => {
    const result = await process(
      '.card { width: 187.5px; margin: -10px; font-size: 16px; border: 1px solid; }',
    )

    expect(result.css).toContain('width: clamp(160px, 50vw, 240px)')
    expect(result.css).toContain(
      'font-size: clamp(0.94867rem, calc(0.65rem + 1.49333vw), 1.098rem)',
    )
    expect(result.css).toContain('margin: clamp(-12.8px, -2.66667vw, -8.53333px)')
    expect(result.css).toContain('border: 1px solid')
  })

  it('uses independent app and pc design canvases', async () => {
    const result = await process(`
      @adaptive app { .hero { width: 187.5px } }
      @adaptive pc { .hero { width: 720px } }
    `)

    expect(result.css).toContain('@media (max-width: 767.98px)')
    expect(result.css).toContain('width: clamp(160px, 50vw, 240px)')
    expect(result.css).toContain('@media (min-width: 768px)')
    expect(result.css).toContain('width: clamp(512px, 50vw, 960px)')
  })

  it('supports named container-query profiles', async () => {
    const result = await process('@adaptive panel { .tile { padding: 20px } }', {
      defaultProfile: 'panel',
      profiles: {
        panel: {
          designWidth: 800,
          fluid: { minWidth: 400, maxWidth: 1200 },
          unit: 'cqi',
          query: {
            type: 'container',
            name: 'workspace',
            condition: '(min-width: 400px)',
          },
        },
      },
    })

    expect(result.css).toContain('@container workspace (min-width: 400px)')
    expect(result.css).toContain('padding: clamp(10px, 2.5cqi, 30px)')
  })

  it('does not touch strings, URLs, custom properties, or hairlines', async () => {
    const result = await process(`
      .icon {
        content: "16px";
        background: url('/16px/icon.png');
        --space: 16px;
        transform: translate(10px, calc(100% - 20px));
        outline: .5px solid;
      }
    `)

    expect(result.css).toContain('content: "16px"')
    expect(result.css).toContain("url('/16px/icon.png')")
    expect(result.css).toContain('--space: 16px')
    expect(result.css).toContain('translate(clamp(8.53333px, 2.66667vw, 12.8px)')
    expect(result.css).toContain('outline: .5px solid')
  })

  it('honors property, selector, value, and comment exclusions', async () => {
    const result = await process(
      `
      /* adaptive-ignore-rule */ .legacy { width: 50px }
      .skip-me { width: 50px }
      .card {
        /* adaptive-ignore-next */ width: 40px;
        height: 30px; /* adaptive-ignore */
        padding: 20px;
        margin: 99px;
      }
    `,
      {
        propList: ['*', '!padding'],
        selectorExclude: ['skip-me'],
        valueExclude: [/99px/],
      },
    )

    expect(result.css).toContain('.legacy { width: 50px }')
    expect(result.css).toContain('.skip-me { width: 50px }')
    expect(result.css).toContain('width: 40px')
    expect(result.css).toContain('height: 30px')
    expect(result.css).toContain('padding: 20px')
    expect(result.css).toContain('margin: 99px')
  })

  it('keeps ignore directives, so they still apply on a second pass', async () => {
    const source = [
      '/* adaptive-ignore-rule */ .legacy { width: 50px }',
      '.card { /* adaptive-ignore-next */ width: 40px; height: 30px; /* adaptive-ignore */ }',
    ].join('\n')
    const once = await process(source)
    const twice = await postcss([adaptiveMatrix()]).process(once.css, {
      from: '/project/src/app.css',
    })

    // Consuming the comment would leave the ignored pixels indistinguishable
    // from pixels nobody thought about, and this project asks you *not* to
    // exclude node_modules — so pre-compiled CSS gets a second pass routinely.
    expect(once.css).toContain('adaptive-ignore-rule')
    expect(twice.css).toBe(once.css)
  })

  it('can preserve the original fallback and transform custom properties', async () => {
    const result = await process('.box { --gap: 20px; width: 100px }', {
      preserveOriginal: true,
      transformCustomProperties: true,
    })

    expect(result.css).toContain('--gap: 20px; --gap: clamp(')
    expect(result.css).toContain('width: 100px; width: clamp(')
  })

  it('converts a repeated declaration, not only its first occurrence', async () => {
    // The later declaration wins the cascade. Treating it as an already-emitted
    // fallback and skipping it would leave the authored pixels in effect, so the
    // whole conversion would silently do nothing.
    const result = await process('.box { width: 100px; color: red; width: 100px }')

    expect(result.css).not.toContain('100px')
    expect(result.css.match(/clamp\(/g)).toHaveLength(2)
  })

  it('leaves an existing fallback pair alone, so a second pass is a no-op', async () => {
    const options = { preserveOriginal: true }
    const once = await process('.box { width: 100px }', options)
    const twice = await postcss([adaptiveMatrix(options)]).process(once.css, {
      from: '/project/src/app.css',
    })

    expect(twice.css).toBe(once.css)
  })

  it('supports file include/exclude and functional design widths', async () => {
    const options = defineConfig({
      include: /src/,
      exclude: /vendor/,
      defaultProfile: 'app',
      profiles: {
        app: {
          designWidth: ({ file }: { file: string }) => (file.includes('narrow') ? 320 : 400),
          fluid: { minWidth: 320, maxWidth: 640 },
        },
      },
      strategy: 'viewport' as const,
    })
    const included = await process('.a { width: 32px }', options, '/src/narrow.css')
    const excluded = await process('.a { width: 32px }', options, '/src/vendor/a.css')

    expect(included.css).toContain('width: 10vw')
    expect(excluded.css).toContain('width: 32px')
  })

  it('warns and preserves unknown profiles by default', async () => {
    const result = await process('@adaptive watch { .a { width: 20px } }')
    expect(result.warnings()).toHaveLength(1)
    expect(result.warnings()[0]?.text).toContain('Unknown adaptive profile "watch"')
    expect(result.css).toContain('@adaptive watch')
  })

  it('does not tell an unknown profile error to enable the mode it is already in', async () => {
    const failure = await process('@adaptive watch { .a { width: 20px } }', {
      unknownProfile: 'error',
    }).catch((error: unknown) => (error as Error).message)

    expect(failure).toContain('Unknown adaptive profile "watch"')
    // The build stopped here, so nothing was "left as authored" and there is no
    // setting left to turn on.
    expect(failure).not.toContain('unknownProfile')
    expect(failure).not.toContain('left as authored')
  })

  describe('@adaptive on a profile that declares no query', () => {
    // A project that splits its two designs across folders routes canvases by
    // path and has no reason to give either profile a query. Reaching for
    // `@adaptive pc` inside a shared component then reads as "these rules are
    // for the desktop canvas" and compiles as "these rules are unconditional
    // and, being last, win everywhere". Nothing in the build says otherwise.
    const folderSplit = {
      defaultProfile: 'app',
      profiles: {
        app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
        pc: { designWidth: 1440, fluid: { minWidth: 1024, maxWidth: 1920 } },
      },
    } as const

    const shared = '.shared { padding: 32px }\n@adaptive pc { .shared { padding: 48px } }'

    it('warns that the rules stay unconditional, and says how to fix it', async () => {
      const result = await process(shared, folderSplit)

      expect(result.warnings()).toHaveLength(1)
      const text = result.warnings()[0]!.text
      expect(text).toContain('declares no query')
      expect(text).toContain('unconditional')
      expect(text).toContain('query: false')
      // The compilation itself is unchanged: the canvas was applied, and both
      // rules are still there. Only the warning is new.
      expect(result.css).toContain('clamp(34.13333px, 3.33333vw, 64px)')
      expect(result.css).not.toContain('@media')
    })

    it('stays silent when query: false says the switch happens elsewhere', async () => {
      // One bundle per target, or a canvas chosen by an environment flag. The
      // author has already answered the question the warning would ask.
      const result = await process(shared, {
        ...folderSplit,
        profiles: { ...folderSplit.profiles, pc: { ...folderSplit.profiles.pc, query: false } },
      })

      expect(result.warnings()).toHaveLength(0)
      expect(result.css).toContain('clamp(34.13333px, 3.33333vw, 64px)')
    })

    it('stays silent when the block names the canvas the rules are already on', async () => {
      // Nothing is being switched, so nothing can be lost by unwrapping.
      const result = await process('@adaptive app { .a { padding: 32px } }', folderSplit)
      expect(result.warnings()).toHaveLength(0)
    })
  })

  it('recognises the at-rule whatever its case, as a browser would', async () => {
    // At-keywords are ASCII case-insensitive. Matching exactly would leave
    // `@ADAPTIVE` unrecognised, and browsers discard an at-rule they do not
    // know along with its contents — the block would vanish, silently.
    const result = await process('@ADAPTIVE pc { .a { width: 100px } }')

    expect(result.css).not.toContain('ADAPTIVE')
    expect(result.css).toContain('@media (min-width: 768px)')
    expect(result.warnings()).toHaveLength(0)
  })

  it('rejects a propList that is nothing but exclusions', async () => {
    // Matches no property at all, so the plugin would convert nothing anywhere
    // — and `['!border*']` is a very natural way to write "everything but
    // borders".
    await expect(process('.a { width: 10px }', { propList: ['!border*'] })).rejects.toThrow(
      /only exclusions.*'\*', '!border\*'/s,
    )
  })

  it('can unwrap profiles without a query', async () => {
    const result = await process('@adaptive raw { .a { width: 20px } }', {
      defaultProfile: 'raw',
      profiles: {
        raw: {
          designWidth: 400,
          fluid: { minWidth: 320, maxWidth: 800 },
          query: false,
        },
      },
    })
    expect(result.css).not.toContain('@adaptive')
    expect(result.css).toContain('.a { width: clamp(16px, 5vw, 40px) }')
  })
})

describe('selector lists that span two canvases', () => {
  // 750 rather than the default, so Vant's 375 canvas gives a different number
  // and "which canvas won" is visible in the output.
  const options = {
    defaultProfile: 'app',
    profiles: { app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 480 } } },
  }

  it('warns, and says which selector lost', async () => {
    const result = await process('.van-cell, .page-hero { padding: 16px }', options)

    // One declaration, one result: `.page-hero` is silently scaled by Vant's
    // canvas. Writing the two rules separately gives each its own.
    expect(result.warnings()).toHaveLength(1)
    expect(result.warnings()[0]!.text).toContain('".page-hero" belongs to app')
    expect(result.warnings()[0]!.text).toContain('compiled against library:vant')
    expect(result.css).toContain('4.26667vw')
  })

  it('warns when the canvas that won does not convert at all', async () => {
    // Element Plus draws in real pixels, so the whole rule keeps its 16px and
    // the Vant half quietly stops scaling.
    const result = await process('.van-cell, .el-input { padding: 16px }', options)

    expect(result.warnings()[0]!.text).toContain('compiled against (not converted)')
  })

  it('stays quiet when every selector agrees', async () => {
    for (const selector of ['.van-cell, .van-button', '.page-a, .page-b', '*, *::before']) {
      const result = await process(`${selector} { padding: 16px }`, options)
      expect(result.warnings(), selector).toHaveLength(0)
    }
  })

  it('does not mistake an argument comma for a selector boundary', async () => {
    for (const selector of ['.van-cell:not(.a, .b)', '[data-x="a,b"].van-cell']) {
      const result = await process(`${selector} { padding: 16px }`, options)
      expect(result.warnings(), selector).toHaveLength(0)
    }
  })

  it('stays quiet when @adaptive already decided', async () => {
    // An explicit canvas outranks every route, so there is no disagreement to
    // report — the author has already answered the question.
    const result = await process(
      '@adaptive app { .van-cell, .page-hero { padding: 16px } }',
      options,
    )

    expect(result.warnings()).toHaveLength(0)
  })
})

describe('presets and foundation', () => {
  it('injects an opt-in centered root, safe-area variables, and profile caps', async () => {
    const result = await process('.a { width: 10px }', appPcPreset({ rootSelector: '#app' }))
    expect(result.css).toContain('@layer adaptive-matrix')
    expect(result.css).toContain(':where(#app)')
    expect(result.css).toContain('margin-inline: auto')
    expect(result.css).toContain('--adaptive-safe-top')
    expect(result.css).toContain('max-inline-size: 480px')
    expect(result.css).toContain('max-inline-size: 1920px')
  })

  it('confines the foundation to matching files when injectTo is set', async () => {
    // Every component <style> block is its own file. Without a way to narrow
    // this, a 150-component project ships 150 copies of the same global CSS.
    const options = appPcPreset({ rootSelector: '#app', rootInjectTo: 'styles/main' })
    const entry = await process('.a { width: 10px }', options, '/project/src/styles/main.css')
    const component = await process(
      '.a { width: 10px }',
      options,
      '/project/src/views/home/index.vue?vue&type=style&index=0&lang.scss',
    )

    expect(entry.css).toContain(':where(#app)')
    expect(component.css).not.toContain(':where(#app)')
    // The narrowing is about the foundation only; conversion still happens.
    expect(component.css).toContain('clamp(')
  })

  it('injects into every file when injectTo is omitted', async () => {
    const options = appPcPreset({ rootSelector: '#app' })
    for (const file of ['/project/src/a.css', '/project/src/b.css']) {
      const result = await process('.a { width: 10px }', options, file)
      expect(result.css).toContain(':where(#app)')
    }
  })

  it('accepts a regular expression or a predicate for injectTo', async () => {
    for (const injectTo of [/main\.css$/, (file: string) => file.endsWith('main.css')]) {
      const options = { root: { selector: '#app', injectTo } }
      const entry = await process('.a { width: 10px }', options, '/project/src/main.css')
      const other = await process('.a { width: 10px }', options, '/project/src/other.css')

      expect(entry.css).toContain(':where(#app)')
      expect(other.css).not.toContain(':where(#app)')
    }
  })

  it('passes the two support switches through to the foundation', async () => {
    // Both exist for browsers that would otherwise discard something: no
    // `@layer` takes the whole block, no logical properties leaves the column
    // pinned to the left edge. Reaching either should not cost you the preset.
    const result = await process(
      '.a { width: 10px }',
      appPcPreset({ rootSelector: '#app', rootLayer: false, rootLogical: false }),
    )
    expect(result.css).not.toContain('@layer')
    expect(result.css).not.toContain('inline-size')
    expect(result.css).toContain('max-width: 480px')
    expect(result.css).toContain('margin-left: auto')
    // Still the foundation, just spelled for an older browser.
    expect(result.css).toContain(':where(#app)')
  })

  it('exposes the named preset collection', () => {
    expect(presets.appPc).toBe(appPcPreset)
    expect(appPcPreset({ container: true, rootSelector: '.shell' }).root).toMatchObject({
      selector: '.shell',
      container: true,
    })
  })
})

describe('reading more than one source unit', () => {
  const atomic = { unitToConvert: ['px', 'rem'] } as const

  it('leaves rem alone under the default configuration', async () => {
    // The default reads `px` only, so an atomic framework's output passes
    // through untouched rather than being read as a pile of one-pixel lengths.
    const result = await process('.p-4 { padding: 1rem }')
    expect(result.css).toBe('.p-4 { padding: 1rem }')
  })

  it('gives a size written in rem and the same size written in px one answer', async () => {
    const result = await process('.a { margin: 2rem } .b { margin: 32px }', atomic)
    const [first, second] = result.css.split('} ')
    expect(first).toContain('clamp(27.30667px, 8.53333vw, 40.96px)')
    expect(second).toContain('clamp(27.30667px, 8.53333vw, 40.96px)')
  })

  it('measures the hairline and minPixelValue guards in pixels, not in authored numbers', async () => {
    // A framework writing a hairline as `0.0625rem` means the same device pixel
    // as one writing `1px`, and neither is a measurement off the design canvas.
    const result = await process('.a { border-width: 0.0625rem; outline-width: 1px }', atomic)
    expect(result.css).toBe('.a { border-width: 0.0625rem; outline-width: 1px }')

    const guarded = await process('.a { top: 0.5rem }', {
      ...atomic,
      minPixelValue: 16,
    })
    expect(guarded.css).toBe('.a { top: 0.5rem }')
  })

  it('reads em at face value, because no build-time number can stand in for it', async () => {
    // `em` resolves against the element's inherited font size. Scaling it like
    // `rem` would be right only where the two happen to agree.
    const result = await process('.a { padding: 2em; margin: 2rem }', {
      ...atomic,
      unitToConvert: ['px', 'rem', 'em'],
      hairline: 0,
    })
    expect(result.css).toContain('padding: clamp(1.70667px, 0.53333vw, 2.56px)')
    expect(result.css).toContain('margin: clamp(27.30667px, 8.53333vw, 40.96px)')
  })

  it('honours rootValue on both sides of the conversion', async () => {
    // `html { font-size: 62.5% }`: one rem is ten pixels going in, and the
    // static half of a text length is written in those same tens going out.
    const tens = { ...atomic, rootValue: 10 }
    const result = await process('.a { padding: 3.2rem; font-size: 3.2rem }', tens)
    const pixels = await process('.a { padding: 32px; font-size: 32px }', tens)
    expect(result.css).toBe(pixels.css)

    // Ten of these rem are what sixteen of the default ones measure.
    const standard = await process('.a { font-size: 32px }', atomic)
    const scaled = (css: string) => Number(/clamp\(([\d.]+)rem/.exec(css)![1])
    expect(scaled(pixels.css) * 10).toBeCloseTo(scaled(standard.css) * 16, 4)
  })

  it('rejects a regular expression where a token prefix belongs', () => {
    // The other two route channels take patterns, so this is the mistake people
    // make. Untyped `.mjs` configuration means the type system will not catch it.
    expect(() =>
      resolveOptions({ routes: [{ profile: 'app', property: [/^--spacing$/ as never] }] }),
    ).toThrow(/takes custom-property prefixes as strings.*regular expression/s)
  })

  it('does not let one unit shadow another that ends the same way', async () => {
    // `rem` ends in `em`; a naive alternation could match the tail and leave a
    // stray `r` in the output.
    const result = await process('.a { padding: 1rem }', {
      ...atomic,
      unitToConvert: ['em', 'rem'],
    })
    expect(result.css).not.toContain('r clamp')
    expect(result.css).toContain('padding: clamp(13.65333px, 4.26667vw, 20.48px)')
  })
})

describe('withAtomicCss', () => {
  it('adds rem and a theme-token route without discarding what it wraps', () => {
    const base = defineConfig({
      defaultProfile: 'mobile',
      profiles: { mobile: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } } },
      routes: [{ profile: false as const, file: ['legacy/'] }],
      preserveOriginal: true,
    })
    const wrapped = withAtomicCss(base)

    expect(wrapped.unitToConvert).toEqual(['px', 'rem'])
    expect(wrapped.preserveOriginal).toBe(true)
    expect(wrapped.profiles).toBe(base.profiles)
    // The caller's own route stays first, so a hand-written decision still wins.
    expect(wrapped.routes[0]).toBe(base.routes[0])
    expect(wrapped.routes[1]).toEqual({
      profile: 'mobile',
      property: ['--spacing', '--text-', '--leading-', '--radius-', '--container-'],
    })
  })

  it('leaves the breakpoint scale alone', () => {
    // Scaling `--breakpoint-md` would move the width a canvas switches at, and
    // every downstream media query with it. Nothing would report that.
    const claimed = withAtomicCss(appPcPreset()).routes.at(-1)!.property as string[]
    expect(claimed).not.toContain('--breakpoint-')
    expect(claimed.some((prefix) => '--breakpoint-md'.startsWith(prefix))).toBe(false)
    // `--tracking-*` is published in em, which already rides a fluid font size.
    expect(claimed.some((prefix) => '--tracking-wide'.startsWith(prefix))).toBe(false)
  })

  it('does not add rem twice, and keeps an unusual source unit', () => {
    expect(withAtomicCss({ unitToConvert: 'rem' }).unitToConvert).toEqual(['rem'])
    expect(withAtomicCss({ unitToConvert: ['dp', 'REM'] }).unitToConvert).toEqual(['dp', 'REM'])
    expect(withAtomicCss({ unitToConvert: 'dp' }).unitToConvert).toEqual(['dp', 'rem'])
  })

  it('restores the token text patterns when the caller took textProperties over', () => {
    // Annotated rather than inline: `withAtomicCss` returns the shape it was
    // given, so a bare `{}` narrows the result to an object with no properties
    // and `textProperties` stops being a name the compiler will discuss.
    const empty: AdaptiveMatrixOptions = {}
    // Untouched by default — the defaults already carry them.
    expect(withAtomicCss(empty).textProperties).toBeUndefined()

    const narrowed = withAtomicCss({ textProperties: ['font-size'] })
    expect(narrowed.textProperties).toEqual(['font-size', '--text-*', '--leading-*'])
    // Idempotent, so wrapping an already-wrapped configuration is harmless.
    expect(withAtomicCss(narrowed).textProperties).toEqual(narrowed.textProperties)
  })

  it('accepts extra token families and an explicit canvas', () => {
    const wrapped = withAtomicCss(appPcPreset(), {
      profile: 'pc',
      tokenPrefixes: ['--gutter-'],
    })
    expect(wrapped.routes.at(-1)).toMatchObject({ profile: 'pc' })
    expect(wrapped.routes.at(-1)!.property).toContain('--gutter-')
  })

  it('scales a theme token and the utility that multiplies it to the same size', async () => {
    // `.p-4` is `calc(var(--spacing) * 4)`, so the utility never sees a length.
    // Multiplying through a clamp is exact for a positive factor, which is why
    // claiming the token at its source is enough.
    const options = withAtomicCss({
      defaultProfile: 'app',
      profiles: { app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } } },
    })
    const result = await process(
      ':root { --spacing: 0.25rem } .p-4 { padding: calc(var(--spacing) * 4) }',
      options,
    )
    expect(result.css).toContain('--spacing: clamp(3.41333px, 1.06667vw, 5.12px)')

    const direct = await process('.p-4 { padding: 16px }', options)
    expect(direct.css).toContain('clamp(13.65333px, 4.26667vw, 20.48px)')
    // 4 x each bound of the token's clamp is the literal 16px result.
    for (const [token, literal] of [
      [3.41333, 13.65333],
      [1.06667, 4.26667],
      [5.12, 20.48],
    ]) {
      expect(token! * 4).toBeCloseTo(literal!, 4)
    }
  })

  it('gives a theme font size the same zoomable formula as a declared one', async () => {
    const options = withAtomicCss({
      defaultProfile: 'app',
      profiles: { app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 } } },
    })
    const token = await process(':root { --text-lg: 1.125rem }', options)
    const declared = await process('.x { font-size: 18px }', options)
    const formula = /clamp\([^)]*\([^)]*\)[^)]*\)/.exec(declared.css)![0]
    expect(token.css).toContain(formula)
    expect(formula).toContain('rem')
  })
})

describe('selectors that mention a library without being one', () => {
  const options = {
    defaultProfile: 'app',
    profiles: { app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } } },
    libraries: ['vant'],
  } as const

  /** What `.page-hero { padding: 16px }` compiles to on the project canvas. */
  const onPage = 'clamp(6.82667px, 2.13333vw, 12.8px)'
  /** The same 16px read as a Vant length, which is twice the size. */
  const onVant = 'clamp(13.65333px, 4.26667vw, 25.6px)'

  it('does not route a rule by an element it excludes', async () => {
    // `.page-hero:not(.van-cell)` matches no Vant component whatsoever — the
    // argument names what is *excluded*. Routing on the raw text put the whole
    // rule on Vant's 375 canvas and every length came out twice the size, with
    // nothing anywhere saying so.
    const result = await process('.page-hero:not(.van-cell) { padding: 16px }', options)

    expect(result.css).toContain(onPage)
    expect(result.css).not.toContain(onVant)
    expect(result.warnings()).toHaveLength(0)
  })

  it('does not route a rule by what it merely contains', async () => {
    const result = await process('.page-hero:has(> .van-icon) { padding: 16px }', options)

    expect(result.css).toContain(onPage)
    expect(result.warnings()).toHaveLength(0)
  })

  it('still routes on the part that does match', async () => {
    const result = await process('.van-cell:not(.page-hero) { padding: 16px }', options)

    expect(result.css).toContain(onVant)
    expect(result.warnings()).toHaveLength(0)
  })

  describe('a genuinely mixed list inside :is()', () => {
    it('reports it, and says splitting is free when the branches agree', async () => {
      const result = await process(':is(.van-cell, .page-hero) { padding: 16px }', options)

      expect(result.warnings()).toHaveLength(1)
      const text = result.warnings()[0]!.text
      expect(text).toContain('inside :is()')
      expect(text).toContain('.page-hero')
      expect(text).toContain('one declaration can only have one result')
      expect(text).toContain('specificity-neutral')
      expect(text).toContain('0-1-0')
      // Reported, not rewritten: the author still gets back what they wrote.
      expect(result.css).toContain(':is(.van-cell, .page-hero)')
    })

    it('says what splitting would cost when the branches do not agree', async () => {
      // `:is()` matches every branch at its highest, so `.page-hero` matches at
      // 1-0-0 today and would drop to 0-1-0 on its own — which can hand the
      // element to a rule that used to lose.
      const result = await process(':is(#main .van-cell, .page-hero) { padding: 16px }', options)

      const text = result.warnings()[0]!.text
      expect(text).toContain('not specificity-neutral')
      expect(text).toContain('1-1-0')
      expect(text).toContain('0-1-0')
    })

    it('reports a :where() list too, where splitting is always free', async () => {
      const result = await process(':where(.van-cell, .page-hero) { padding: 16px }', options)

      const text = result.warnings()[0]!.text
      expect(text).toContain('inside :where()')
      expect(text).toContain('specificity-neutral')
    })

    it('stays quiet when every branch lands on the same canvas', async () => {
      const result = await process(':is(.van-cell, .van-button) { padding: 16px }', options)
      expect(result.warnings()).toHaveLength(0)
    })

    it('does not report the brackets twice over for one rule', async () => {
      const result = await process(
        ':is(.van-cell, .page-hero), :is(.van-tag, .page-foot) { padding: 16px }',
        options,
      )
      expect(result.warnings()).toHaveLength(1)
    })

    it('defers to @adaptive, which already decided', async () => {
      const result = await process(
        '@adaptive app { :is(.van-cell, .page-hero) { padding: 16px } }',
        options,
      )
      expect(result.warnings()).toHaveLength(0)
    })
  })
})
