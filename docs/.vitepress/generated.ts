/**
 * Files the site serves that are not pages.
 *
 * Four kinds, all produced from the same sources the site is built from:
 *
 *  - `llms.txt` and `llms-full.txt`, the entry points a coding agent fetches;
 *  - the raw Markdown of every page, at the page's own URL plus `.md`, so that
 *    "copy this page for an LLM" is a fetch rather than a scrape of rendered
 *    HTML with a sidebar and a search box in it;
 *  - `schema/options.json`, the same options as data rather than as prose;
 *  - the favicon, which is small enough to be worth generating rather than
 *    committing a binary for.
 *
 * They are produced by one function and served two ways — by a dev middleware
 * while writing, and written into `outDir` at the end of a build. A file that
 * works in `vitepress dev` and 404s in production is exactly the failure this
 * shape rules out.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { llmsFullTxt, llmsTxt } from './llms'
import { isPublished, rewrite, SRC_DIR } from './paths'
import { optionsSchema } from './schema'

/** Where the site is deployed. Agents need an absolute URL; readers do not. */
export const SITE_URL = process.env.SITE_URL ?? 'https://moresyl.github.io/postcss-adaptive-matrix/'

/** Directories with no publishable Markdown in them. */
const SKIP = new Set([
  'node_modules',
  'dist',
  'coverage',
  'bench',
  'test',
  'cases',
  '.git',
  '.firecrawl',
  '.libcheck',
  '.github',
])

function markdownFiles(directory = SRC_DIR): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(full))
    else if (entry.name.endsWith('.md')) found.push(full)
  }
  return found
}

/**
 * A square of nested canvases: the same drawing at three widths, which is the
 * one idea the whole project is about.
 */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#4c6ef5"/>
  <rect x="5" y="8" width="22" height="16" rx="2.5" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6"/>
  <rect x="9" y="11" width="14" height="10" rx="2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6"/>
  <rect x="13" y="14" width="6" height="4" rx="1.2" fill="#fff"/>
</svg>
`

/**
 * Every generated file, keyed by the path it is served at, without a leading
 * slash so it can be joined onto `outDir` as-is.
 */
export function generatedAssetMap(): Map<string, string> {
  const files = new Map<string, string>()
  files.set('favicon.svg', FAVICON)
  files.set('llms.txt', llmsTxt(SITE_URL, false))
  files.set('llms-full.txt', llmsFullTxt(SITE_URL, false))
  files.set('zh/llms.txt', llmsTxt(SITE_URL, true))
  files.set('zh/llms-full.txt', llmsFullTxt(SITE_URL, true))
  // One document, not one per language: a schema is a type, and the Chinese
  // half of every description travels inside it as `x-description-zh`.
  files.set('schema/options.json', optionsSchema(SITE_URL))

  for (const file of markdownFiles()) {
    const source = path.relative(SRC_DIR, file).split(path.sep).join('/')
    if (!isPublished(source)) continue
    files.set(rewrite(source), readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
  }
  return files
}

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/** Serves the generated files during `vitepress dev`. */
export function generatedAssets(): Plugin {
  return {
    name: 'adaptive-matrix:generated',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = decodeURIComponent((request.url ?? '').split('?')[0])
        const base = server.config.base
        const wanted = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '')
        // Regenerated per request: these are cheap, and a stale llms.txt in a
        // dev server is a bug report that never gets filed.
        const body = generatedAssetMap().get(wanted)
        if (body === undefined) return next()
        response.setHeader('Content-Type', MIME[path.extname(wanted)] ?? 'text/plain')
        response.end(body)
      })
    },
  }
}

/** Writes the generated files into a finished build. */
export async function writeGeneratedAssets(outDir: string): Promise<void> {
  for (const [name, body] of generatedAssetMap()) {
    const target = path.resolve(outDir, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body, 'utf8')
  }
}
