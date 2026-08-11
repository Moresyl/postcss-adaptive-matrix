/**
 * Where a source file ends up on the site, and how a link between two source
 * files is spelled once they get there.
 *
 * The repository is the source of truth. Every page is a `.md` file that reads
 * correctly on GitHub, and every pair is `X.md` plus `X.zh-CN.md` sitting in
 * the same directory — a layout `scripts/check-docs.mjs` enforces. A site wants
 * something else: one directory tree per language, so VitePress can tell which
 * locale a page belongs to and localise its own chrome.
 *
 * Rather than move files and break every link on GitHub, both shapes are kept
 * and this module translates between them:
 *
 *   docs/getting-started.md        →  docs/getting-started.md   (/docs/getting-started)
 *   docs/getting-started.zh-CN.md  →  zh/docs/getting-started.md
 *   docs/README.md                 →  docs/index.md             (/docs/)
 *   README.zh-CN.md                →  zh/index.md
 *
 * The catch is relative links. VitePress resolves them against a page's
 * *rewritten* location, so `./getting-started.zh-CN.md` written inside
 * `docs/README.zh-CN.md` would be looked for at `zh/docs/getting-started.zh-CN`
 * — a page that does not exist, because the Chinese half lost its suffix on the
 * way in. Worse, the language switcher `[English](./README.md)` at the top of
 * every Chinese page would resolve to the Chinese index and quietly link to
 * itself.
 *
 * So links are not resolved on the site at all. `siteHref` resolves them in the
 * repository, where they were written and where they are known to be correct,
 * puts the result through the same `rewrite` the page list uses, and emits an
 * absolute URL. Moving a page on the site then cannot break a link, because no
 * link depends on where any page landed.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

/** The suffix that marks the Chinese half of a pair. */
const ZH = '.zh-CN.md'

/** Repository root, which is also the site's source directory. */
export const SRC_DIR = path.resolve(import.meta.dirname, '../..')

/** Pages that belong on GitHub and npm rather than on the site. */
const EXCLUDED = new Set(['README.md', 'README.zh-CN.md'])

/** Hand-placed pages, applied before the mechanical rules below. */
const PINNED: Record<string, string> = {
  'docs/home.md': 'index.md',
  'docs/home.zh-CN.md': 'zh/index.md',
}

const slash = (value: string) => value.split(path.sep).join('/')

/**
 * The site path for a source page, both relative to the repository root.
 *
 * Returns the input unchanged when nothing moves, which is what VitePress
 * expects from a rewrite function for a page that stays put.
 */
export function rewrite(source: string): string {
  const page = slash(source)
  if (PINNED[page]) return PINNED[page]
  const chinese = page.endsWith(ZH)
  const english = chinese ? `${page.slice(0, -ZH.length)}.md` : page
  const named = english.replace(/(^|\/)README\.md$/, '$1index.md')
  return chinese ? `zh/${named}` : named
}

/** Whether a source page is published at all. */
export function isPublished(source: string): boolean {
  return !EXCLUDED.has(slash(source))
}

/** `docs/index.md` → `/docs/`, `zh/index.md` → `/zh/`, else drop the extension. */
function urlOf(page: string): string {
  const withoutIndex = page.replace(/(^|\/)index\.md$/, '$1')
  return `/${withoutIndex === page ? page.replace(/\.md$/, '') : withoutIndex}`
}

/**
 * A directory link means its index page, in the language of the page linking
 * to it. `[Runnable example](../examples/app-pc/)` appears in both halves of
 * the docs index and should land on a different file in each.
 */
function indexIn(directory: string, chinese: boolean): string | null {
  const wanted = chinese ? ['README.zh-CN.md', 'README.md'] : ['README.md']
  for (const name of wanted) {
    const candidate = path.posix.join(directory, name)
    if (existsSync(path.resolve(SRC_DIR, candidate))) return candidate
  }
  return null
}

/**
 * Rewrite one `href` found in `source` into a site URL.
 *
 * Returns `null` for anything that is not a link between two pages of this
 * repository — external URLs, bare anchors, links to source files, links that
 * leave the tree. Those are left exactly as the author wrote them.
 */
export function siteHref(href: string, source: string): string | null {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return null
  const [, target, tail = ''] = /^([^?#]*)(.*)$/.exec(href)!
  if (!target) return null

  const from = path.posix.dirname(slash(source))
  const resolved = path.posix.normalize(path.posix.join(from, target))
  if (resolved.startsWith('..')) return null

  const page =
    target.endsWith('/') || !path.posix.extname(resolved)
      ? indexIn(resolved, source.endsWith(ZH))
      : resolved.endsWith('.md')
        ? resolved
        : null
  if (!page || !isPublished(page)) return null
  if (!existsSync(path.resolve(SRC_DIR, page))) return null

  return urlOf(rewrite(page)) + tail
}
