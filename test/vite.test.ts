import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Real Vite builds, not calls to `postcss().process`.
 *
 * Everything the integration guide promises is a claim about a build tool, and
 * no amount of direct PostCSS testing can check any of it: whether Vite finds
 * `postcss.config.mjs`, what it passes as `from`, whether a dependency's CSS
 * still carries a `node_modules` path by the time the plugin sees it. Those are
 * exactly the things that break silently — the build succeeds and the CSS is
 * merely wrong — so they are worth the seconds a real build costs.
 *
 * Skipped on a clean checkout with no `dist`, like the other tests that run
 * against the built artefact.
 */
const repo = fileURLToPath(new URL('..', import.meta.url))
const built = existsSync(join(repo, 'dist', 'index.js'))
const describeBuilt = built ? describe : describe.skip

const scratch = join(repo, '.vitecheck')

/** The id Vite hands a Vue `<style>` block, which is a path plus a query string. */
const SFC_ID = 'src/views/mobile/home/index.vue?vue&type=style&index=0&lang.css'

/** Matches the SFC id by containment. */
const CONTAINMENT_ROUTE = String.raw`/[\\/]mobile[\\/]/`
/** The shape the guide warns about: anchored at the end, so the query defeats it. */
const ANCHORED_ROUTE = String.raw`/\.mobile\.css$/`

function write(root: string, relative: string, contents: string): void {
  const file = join(root, relative)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

function scaffold(root: string, route: string): void {
  rmSync(root, { recursive: true, force: true })

  // Imported by absolute URL so the fixture needs no install of the package
  // into its own tree; everything else about the config is what a project writes.
  const entry = JSON.stringify(pathToFileURL(join(repo, 'dist', 'index.js')).href)
  write(
    root,
    'postcss.config.mjs',
    `import adaptiveMatrix from ${entry}

export default {
  plugins: [
    adaptiveMatrix({
      defaultProfile: 'app',
      profiles: {
        app: { designWidth: 750, fluid: { minWidth: 320, maxWidth: 600 } },
        mobile: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 600 } },
      },
      routes: [{ profile: 'mobile', file: [${route}] }],
    }),
  ],
}
`,
  )

  write(root, 'src/page.css', '.page-hero { padding: 32px; font-size: 32px }\n')

  // A dependency resolved the way a project imports one, so the id the plugin
  // sees is whatever Vite makes of a bare specifier — not a path we chose.
  write(root, 'node_modules/vant/package.json', '{ "name": "vant", "version": "0.0.0" }\n')
  write(root, 'node_modules/vant/lib/index.css', '.van-button { padding: 16px; font-size: 16px }\n')

  write(
    root,
    'src/main.js',
    `import './page.css'
import 'vant/lib/index.css'
import './${SFC_ID}'
export const ready = true
`,
  )
}

/** Stands in for `@vitejs/plugin-vue`, which serves style blocks from a queried id. */
function fakeVuePlugin(root: string) {
  const resolved = join(root, SFC_ID)
  return {
    name: 'fake-sfc-styles',
    resolveId: (id: string) => (id.includes('index.vue?vue') ? resolved : null),
    load: (id: string) => (id === resolved ? '.sfc-card { padding: 24px; font-size: 24px }' : null),
  }
}

async function buildCss(root: string): Promise<string> {
  const { build } = await import('vite')
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    // Points Vite at the fixture's directory, so it discovers the config file
    // itself rather than being handed a plugin list.
    css: { postcss: root },
    plugins: [fakeVuePlugin(root)],
    build: {
      outDir: 'out',
      emptyOutDir: true,
      minify: false,
      cssCodeSplit: false,
      rollupOptions: { input: join(root, 'src/main.js') },
    },
  })

  const assets = join(root, 'out', 'assets')
  const sheet = readdirSync(assets).find((name) => name.endsWith('.css'))
  expect(sheet, `no CSS emitted into ${assets}`).toBeDefined()
  return readFileSync(join(assets, sheet!), 'utf8')
}

/** The declared value of `property` inside the rule for `selector`. */
function declaration(css: string, selector: string, property: string): string | null {
  const rule = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)
  if (!rule) return null
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(rule[1]!)
  return found ? found[1]!.trim() : null
}

describeBuilt('a real Vite build', () => {
  const root = join(scratch, 'containment')
  let css = ''

  beforeAll(async () => {
    scaffold(root, CONTAINMENT_ROUTE)
    css = await buildCss(root)
  }, 120_000)

  it('runs the plugin at all, through a config file Vite discovered itself', () => {
    // If `postcss.config.mjs` were not picked up the build would still succeed
    // and emit the stylesheet unchanged, which is the failure mode this exists
    // to catch: nothing anywhere says the plugin never ran.
    expect(css).toContain('clamp(')
    expect(declaration(css, '.page-hero', 'padding')).toBe('clamp(13.65333px, 4.26667vw, 25.6px)')
  })

  it('routes a dependency by the node_modules path Vite gives it', () => {
    // Vant's 16px and the page's 32px are the same size on a 750 design, so
    // after the build they must be the same declaration — font size included,
    // which is the part that only holds because library canvases share the
    // page's text anchor. If the library were left out instead — the
    // `exclude: [/node_modules/]` the guide warns against — these would be
    // bare pixels.
    for (const property of ['padding', 'font-size']) {
      const library = declaration(css, '.van-button', property)
      expect(library, `.van-button has no ${property}`).toMatch(/^clamp\(/)
      expect(library).toBe(declaration(css, '.page-hero', property))
    }
  })

  it('matches a file route against a Vue style block, query string and all', () => {
    // 24px on the 375 canvas the route sends it to, not the 750 default.
    expect(declaration(css, '.sfc-card', 'padding')).toBe('clamp(20.48px, 6.4vw, 38.4px)')
  })

  it('emits output that is stable under a second build', async () => {
    // Watch mode and HMR re-run the pipeline over the same sources; a plugin
    // that is not idempotent drifts on every save rather than failing outright.
    expect(await buildCss(root)).toBe(css)
  }, 120_000)

  it('confirms the trap: a route anchored at the end matches no style block', async () => {
    // Vite's id for an SFC style block ends in `?vue&type=style&index=0&lang.css`,
    // so `/\.mobile\.css$/` never fires and the block quietly stays on the
    // default canvas. The guide says so; this is what makes that true rather
    // than remembered. Everything else in the build is unaffected, which is
    // precisely why it goes unnoticed.
    const trap = join(scratch, 'anchored')
    scaffold(trap, ANCHORED_ROUTE)
    const trapped = await buildCss(trap)

    expect(declaration(trapped, '.sfc-card', 'padding')).toBe('clamp(10.24px, 3.2vw, 19.2px)')
    expect(declaration(trapped, '.sfc-card', 'padding')).not.toBe(
      declaration(css, '.sfc-card', 'padding'),
    )
    expect(declaration(trapped, '.page-hero', 'padding')).toBe(
      declaration(css, '.page-hero', 'padding'),
    )
  }, 120_000)
})
