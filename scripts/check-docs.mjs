/**
 * Checks that the documentation is internally consistent.
 *
 * Three failures this catches, all of which have actually happened here:
 *
 *  - a link to a file that was renamed or never written;
 *  - a link to a heading anchor that no longer exists, which GitHub renders as
 *    a working link that silently lands at the top of the page;
 *  - an English page with no Chinese counterpart, or vice versa. The two are
 *    written separately rather than translated, which is what makes them read
 *    properly and also what lets one of them quietly not exist.
 *
 * Run as part of `npm run check`, or on its own:
 *
 *   node scripts/check-docs.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Directories that hold no authored documentation. */
const SKIP = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.firecrawl',
  '.libcheck',
])

/** The suffix that marks the Chinese half of a pair. */
const ZH = '.zh-CN.md'

function markdownFiles(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(path))
    else if (entry.name.endsWith('.md')) found.push(path)
  }
  return found
}

/**
 * GitHub's heading anchor, near enough.
 *
 * Everything that is not a letter, a number, a space, `_` or `-` is dropped,
 * spaces become hyphens, and a repeated slug takes a numeric suffix. The
 * Unicode property escapes matter rather than `\w`: `## 一个选择器到底在说谁`
 * is a heading here, and its anchor keeps every character.
 */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

/**
 * Anchors a file offers.
 *
 * Splitting on `/\r?\n/` rather than `'\n'` is load-bearing on Windows, where
 * every file here is CRLF: a trailing `\r` defeats `$` in a non-multiline
 * pattern *and* is not matched by `.`, so a naive split finds no headings at
 * all and reports every anchor in the repository as broken. That is not a
 * hypothetical — it is what the first version of this check did.
 */
function anchorsOf(text) {
  const anchors = new Set()
  const seen = new Map()
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (!heading) continue
    const base = slug(heading[1])
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  // Explicit `<a id="...">` and `<a name="...">` targets count too.
  for (const match of text.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']/g)) {
    anchors.add(match[1].toLowerCase())
  }
  return anchors
}

/** Every link target in a file, inline and reference style, images included. */
function linksOf(text) {
  const targets = []
  const withoutFences = text.replace(/(?:^|\n)(?:```|~~~)[\s\S]*?(?:```|~~~)/g, '\n')
  for (const match of withoutFences.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    targets.push(match[1])
  }
  for (const match of withoutFences.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)) {
    targets.push(match[1])
  }
  return targets
}

const files = markdownFiles(ROOT)
const anchorCache = new Map()
function anchorsFor(path) {
  if (!anchorCache.has(path)) {
    anchorCache.set(path, anchorsOf(readFileSync(path, 'utf8')))
  }
  return anchorCache.get(path)
}

const problems = []
const report = (file, message) =>
  problems.push(`${relative(ROOT, file).split(sep).join(posix.sep)}: ${message}`)

for (const file of files) {
  const text = readFileSync(file, 'utf8')

  for (const raw of linksOf(text)) {
    if (/^(?:https?:|mailto:|#\/)/i.test(raw)) continue
    const [path, anchor] = raw.split('#')
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file

    if (path) {
      let stats = null
      try {
        stats = statSync(target)
      } catch {
        report(file, `link to a file that does not exist — ${raw}`)
        continue
      }
      if (stats.isDirectory()) continue
    }
    if (!anchor) continue
    if (!target.endsWith('.md')) continue
    const wanted = decodeURIComponent(anchor).toLowerCase()
    if (!anchorsFor(target).has(wanted)) {
      report(file, `link to a heading that does not exist — ${raw}`)
    }
  }
}

/**
 * Both halves of every pair exist and point at each other.
 *
 * The switcher is checked rather than assumed because a page reachable only by
 * guessing its filename may as well not be there. It is looked for in the first
 * 20 lines rather than the first few: a page may open with a banner and a row
 * of badges, and the README does.
 *
 * `.github` is exempt. Issue and pull-request templates are rendered by GitHub
 * inside its own forms, where there is nowhere for a language switcher to go
 * and no second copy for it to point at.
 */
for (const file of files) {
  if (relative(ROOT, file).split(sep)[0] === '.github') continue
  const isChinese = file.endsWith(ZH)
  const counterpart = isChinese
    ? `${file.slice(0, -ZH.length)}.md`
    : `${file.slice(0, -'.md'.length)}${ZH}`
  if (!files.includes(counterpart)) {
    report(file, `has no ${isChinese ? 'English' : 'Chinese'} counterpart`)
    continue
  }
  const expected = counterpart.split(sep).pop()
  const head = readFileSync(file, 'utf8').split(/\r?\n/).slice(0, 20).join('\n')
  if (!head.includes(expected)) {
    report(file, `does not link to ${expected} near the top`)
  }
}

if (problems.length) {
  console.error(`${problems.length} documentation problem(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(`OK: ${files.length} markdown files, all links, anchors and pairs resolve`)
