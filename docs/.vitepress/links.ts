/**
 * Rewrites every in-repository link to the site URL of the page it points at.
 *
 * VitePress resolves a relative link against the page's location *on the site*.
 * That is the wrong place to resolve these: the links were written to work in
 * the repository, where both halves of a bilingual pair share a directory and
 * are told apart by a `.zh-CN` suffix. On the site they are told apart by a
 * directory, and the suffix is gone. Resolve against the site and
 * `[English](./README.md)` at the top of a Chinese page points back at the
 * Chinese page — a switcher that switches nothing, rendered as a working link.
 *
 * So the resolution happens here, against the repository, before VitePress ever
 * sees the href. `siteHref` returns an absolute URL or `null`; `null` means the
 * target is not a page of this site and the author's own text is left alone.
 */
import path from 'node:path'
import type { MarkdownRenderer } from 'vitepress'
import { siteHref, SRC_DIR } from './paths'

/** Token attributes that can hold a link to another page. */
const HREF: Record<string, string> = { link_open: 'href' }

export function localeLinks(md: MarkdownRenderer): void {
  md.core.ruler.push('adaptive-matrix:links', (state) => {
    // `realPath` is the file on disk; `path` is where the rewrite put it.
    // markdown-it types `env` as `any`; name the two fields VitePress puts
    // there so the rest of the rule is checked rather than assumed.
    const env = state.env as { realPath?: string; path?: string } | undefined
    const file = env?.realPath ?? env?.path
    if (!file) return true
    const source = path.relative(SRC_DIR, file).split(path.sep).join('/')
    if (source.startsWith('..')) return true

    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue
      for (const child of token.children) {
        const attribute = HREF[child.type]
        if (!attribute) continue
        const attr = child.attrs?.[child.attrIndex(attribute)]
        if (!attr) continue
        const rewritten = siteHref(attr[1], source)
        if (rewritten) attr[1] = rewritten
      }
    }
    return true
  })
}
