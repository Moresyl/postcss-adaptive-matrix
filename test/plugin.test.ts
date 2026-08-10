import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix, { appPcPreset, defineConfig, presets } from '../src/index.js'

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
    const result = await process(
      '@adaptive panel { .tile { padding: 20px } }',
      {
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
      },
    )

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
          designWidth: ({ file }: { file: string }) =>
            file.includes('narrow') ? 320 : 400,
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

  it('exposes the named preset collection', () => {
    expect(presets.appPc).toBe(appPcPreset)
    expect(appPcPreset({ container: true, rootSelector: '.shell' }).root).toMatchObject({
      selector: '.shell',
      container: true,
    })
  })
})
