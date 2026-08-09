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
    expect(result.css).not.toContain('adaptive-ignore')
  })

  it('can preserve the original fallback and transform custom properties', async () => {
    const result = await process('.box { --gap: 20px; width: 100px }', {
      preserveOriginal: true,
      transformCustomProperties: true,
    })

    expect(result.css).toContain('--gap: 20px; --gap: clamp(')
    expect(result.css).toContain('width: 100px; width: clamp(')
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

  it('exposes the named preset collection', () => {
    expect(presets.appPc).toBe(appPcPreset)
    expect(appPcPreset({ container: true, rootSelector: '.shell' }).root).toMatchObject({
      selector: '.shell',
      container: true,
    })
  })
})
