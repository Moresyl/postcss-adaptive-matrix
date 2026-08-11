/**
 * What the compiled stylesheet asks of a browser, and what to do about it.
 *
 * Every entry below is a CSS feature this compiler can put in your output. The
 * audit reads the output rather than the configuration, which is the only way
 * the two can never drift apart: a feature that reaches the stylesheet through
 * a preset, a library route, or your own authored CSS is still a feature you
 * ship, and it shows up here either way.
 *
 * The recurring shape of a CSS support failure is worth stating once, because
 * it explains why the `failure` fields below read the way they do. CSS does not
 * degrade gracefully by default — it degrades by *discarding*. A value the
 * parser cannot read invalidates its whole declaration; a selector it cannot
 * read invalidates the whole rule; an at-rule it cannot read invalidates the
 * whole block. None of that is reported anywhere. So the question for each
 * feature is not "does it work" but "how much disappears when it doesn't".
 */
import { FEATURE_SUPPORT, type CaniuseFeatureId } from './compat-data.js'

export type CompatFeatureId =
  | 'math-functions'
  | 'viewport-units'
  | 'logical-viewport-units'
  | 'container-query-units'
  | 'container-queries'
  | 'cascade-layers'
  | 'env-function'
  | 'where-pseudo'
  | 'has-pseudo'
  | 'custom-properties'
  | 'logical-properties'
  | 'nesting'

export interface CompatFeature {
  id: CompatFeatureId
  /** How the feature appears in CSS, short enough to name in a message. */
  title: string
  /** The caniuse entry the version numbers come from. */
  source: CaniuseFeatureId
  /**
   * Set when `source` is the closest available entry rather than the exact
   * one. caniuse does not track every feature separately, and saying which
   * substitute was used is better than quietly presenting it as a measurement.
   */
  proxy?: string
  /** What in this compiler emits it. */
  emittedBy: string
  /** What a browser without support actually does — usually, discards something. */
  failure: string
  /** The switch that stops it being emitted, and what turning it off costs. */
  fallback: string
  /**
   * Recognises the feature in compiled CSS.
   *
   * Absent for features this compiler never emits, which are listed anyway
   * because they are reasonable things to ask about.
   */
  detect?: RegExp
}

/**
 * Every feature in the compiler's output vocabulary.
 *
 * Ordered by how much breaks when it is missing, worst first: an at-rule takes
 * its whole block, a selector takes its whole rule, and a value takes only its
 * own declaration.
 */
export const COMPAT_FEATURES: readonly CompatFeature[] = Object.freeze([
  {
    id: 'cascade-layers',
    title: '@layer',
    source: 'css-cascade-layers',
    emittedBy:
      "root.layer, which appPcPreset sets to 'adaptive-matrix' whenever a rootSelector is given",
    failure:
      'The whole @layer block is dropped, so the entire root foundation goes with it — the centred column, the safe-area variables and the fixed-position correction all vanish at once. This is the largest single loss in the list.',
    fallback:
      'root.layer: false emits the same rules unwrapped. The cost is cascade position: the foundation then competes with your own CSS on ordinary specificity instead of losing to it by construction, so a project that relied on overriding it without thinking may need real selectors.',
    detect: /@layer\b/i,
  },
  {
    id: 'where-pseudo',
    title: ':where()',
    source: 'css-matches-pseudo',
    // caniuse has no entry for `:where()`. `:is()` is the right stand-in
    // rather than a convenient one: the two shipped together in Chrome 88,
    // Firefox 78 and Safari 14, from the same specification section.
    proxy: ':is(), which shipped in the same releases',
    emittedBy: 'every root foundation rule, which wraps root.selector in it',
    failure:
      'The selector is unreadable, so each foundation rule is dropped — the same outcome as losing @layer, reached one rule at a time.',
    fallback:
      'root: false removes the foundation entirely, which is blunt but is the supported path. There is no option to emit the bare selector, because the zero specificity is the point: it is what lets your own CSS override the foundation without a specificity contest.',
    detect: /:where\(/i,
  },
  {
    id: 'has-pseudo',
    title: ':has()',
    source: 'css-has',
    emittedBy:
      'nothing. Like native nesting, it reaches your output only from your own CSS or from a component library — but unlike nesting it is unmistakable in the text, so the audit reports it rather than guessing.',
    failure:
      'The selector is unreadable and the whole rule is dropped. Worth singling out because of *when* support arrived rather than how bad the failure is: :has() is the newest selector in everyday use, and Firefox only shipped it in 121 — years after Chrome 105 and Safari 15.4. A stylesheet that looks fine in three browsers can lose entire rules in the fourth.',
    fallback:
      'None from this compiler; the fix is in the selector. Rewrite the rule so the condition is expressed on the element itself — a class the component already sets, or :not(:empty) where that is what was meant. The compiler does route such rules correctly either way: a :has() argument names what an element contains, not which design file it was drawn on, so it is excluded from canvas matching.',
    detect: /:has\(/i,
  },
  {
    id: 'container-queries',
    title: '@container and container-type',
    source: 'css-container-queries',
    emittedBy: "root.container: true, and any profile whose query is { type: 'container' }",
    failure:
      'A container-type declaration is dropped, which is quiet; an @container block is dropped whole, which is not. A profile that switches on a container query stops switching, so every canvas but the default one disappears.',
    fallback:
      'root.container: false and media-type profile queries. Media queries measure the viewport rather than an ancestor, which is what you want anyway unless the component genuinely reflows inside a resizable panel.',
    detect: /@container\b|(?:^|[;{\s])container(?:-type|-name)?\s*:/i,
  },
  {
    id: 'math-functions',
    title: 'clamp(), min(), max()',
    source: 'css-math-functions',
    emittedBy:
      "strategy: 'clamp' — the default — for every converted length, and root.fixedContainingBlock for the gutter arithmetic",
    failure:
      'Each declaration holding one is dropped, so the property falls back to whatever it inherits or to its initial value. Not a slightly wrong size: no size at all.',
    fallback:
      "strategy: 'viewport' emits a bare viewport length instead, which is supported almost everywhere but has no bounds — the design keeps scaling past the ends of its fluid range. preserveOriginal: true is the other half: it keeps the authored pixel value as a preceding declaration, so a browser that drops the fluid one lands on the design-canvas size rather than on nothing. The two compose.",
    detect: /(?:^|[^\w-])(?:clamp|min|max)\(/i,
  },
  {
    id: 'container-query-units',
    title: 'cqw and cqi',
    source: 'css-container-query-units',
    emittedBy: "unit: 'cqw' or unit: 'cqi'",
    failure: 'The length is unreadable and its declaration is dropped, exactly as with clamp().',
    fallback:
      "unit: 'vw'. Container units measure the nearest container instead of the viewport, so this is a real change, not only a compatibility one — but it only matters for components that resize independently of the page.",
    detect: /(?:^|[^\w.-])[\d.]+cq[wihb]|(?:^|[^\w.-])[\d.]+cqm(?:in|ax)/i,
  },
  {
    id: 'logical-viewport-units',
    title: 'vi',
    source: 'viewport-unit-variants',
    // caniuse tracks svh/lvh/dvh under this entry and does not track `vi`
    // separately. They are the same batch of the same specification and
    // shipped in the same releases, which is what makes it usable here.
    proxy: 'the small/large/dynamic viewport units, which shipped together with it',
    emittedBy: "unit: 'vi'",
    failure: 'The declaration is dropped.',
    fallback:
      "unit: 'vw', the default. vi follows the writing mode, so the two differ only in vertical writing or in a rotated root — for a horizontal page they are the same measurement, and vw has been supported since Safari 6.1.",
    detect: /(?:^|[^\w.-])[\d.]+vi(?![a-z0-9-])/i,
  },
  {
    id: 'logical-properties',
    title: 'inline-size, margin-inline, max-inline-size',
    source: 'css-logical-props',
    emittedBy: 'the root foundation, whenever root is configured',
    failure:
      'Each declaration is dropped individually, and this is the one failure in the list that produces a plausible-looking page rather than an obviously broken one: losing margin-inline: auto leaves the column the right width and pinned to the left edge, and losing max-inline-size leaves it full-bleed. Nothing about either says "unsupported".',
    fallback:
      'root.logical: false writes width, margin-left/right and max-width instead. Nothing is lost on a horizontal page — the two spellings mean the same thing until the writing mode changes.',
    detect:
      /(?:^|[;{\s])(?:min-|max-)?(?:inline|block)-size\s*:|(?:^|[;{\s])(?:margin|padding|border|inset)-(?:inline|block)(?:-(?:start|end))?\s*:/i,
  },
  {
    id: 'custom-properties',
    title: 'var()',
    source: 'css-variables',
    emittedBy:
      'root.safeAreaVariables and root.fixedContainingBlock, plus any design token your own CSS routes through the compiler',
    failure: 'The declaration is dropped.',
    fallback:
      'root.safeAreaVariables: false and root.fixedContainingBlock: false remove the ones this compiler introduces. Supported since Safari 10 and Chrome 49, so in practice this entry exists to be checked off rather than acted on.',
    // A declaration counts as much as a reference: `--adaptive-safe-top: …`
    // is already the feature, and a browser that cannot parse it never gets
    // as far as the `var()` that would have read it.
    detect: /var\(\s*--|(?:^|[;{\s])--[\w-]+\s*:/i,
  },
  {
    id: 'env-function',
    title: 'env(safe-area-inset-*)',
    source: 'css-env-function',
    emittedBy: 'root.safeAreaVariables',
    failure:
      'Worth being precise about, because the fallback argument does not do what it looks like it does. The 0px in env(safe-area-inset-top, 0px) covers an environment variable the browser knows but has no value for — not a browser that has never heard of env(). Where the function itself is unsupported, --adaptive-safe-top holds an unreadable value, and every declaration reading it through var() is dropped at computed-value time.',
    fallback:
      'root.safeAreaVariables: false. Every browser lacking env() also predates the notches it exists to clear, so there is nothing to compensate for.',
    detect: /\benv\(/i,
  },
  {
    id: 'viewport-units',
    title: 'vw',
    source: 'viewport-units',
    emittedBy: "unit: 'vw', the default, and the root column arithmetic",
    failure: 'The declaration is dropped.',
    fallback:
      'None, and none needed: this is the oldest feature in the list by several years (Safari 6.1, 2013) and predates every other entry. Turning it off would mean not scaling at all.',
    detect: /(?:^|[^\w.-])[\d.]+vw(?![a-z0-9-])/i,
  },
  {
    id: 'nesting',
    title: 'native CSS nesting',
    source: 'css-nesting',
    emittedBy:
      'nothing. The compiler reads nested rules — including @adaptive inside them — and writes each declaration back where it found it, so nesting reaches your output only if it was already in your source.',
    failure:
      'A browser without support drops the nested block. But that is a question about your build, not about this compiler: whether nesting survives depends on whether a preprocessor or postcss-nesting flattened it, and both run outside this plugin.',
    fallback:
      'Flatten it before shipping — Sass and Less already do, and postcss-nesting does it for plain CSS. The audit deliberately does not guess: recognising native nesting by pattern would misread ordinary CSS, and reporting it wrongly is worse than not reporting it.',
  },
])

const BY_ID = new Map(COMPAT_FEATURES.map((feature) => [feature.id, feature]))

/** Human-readable names for the browsers the support data covers. */
export const BROWSER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  chrome: 'Chrome',
  edge: 'Edge',
  safari: 'Safari',
  firefox: 'Firefox',
  ios_saf: 'iOS Safari',
  samsung: 'Samsung Internet',
})

/**
 * Target names this audit understands, including the spellings people reach
 * for. Android WebViews resolve to `chrome`, which is what they run.
 */
const BROWSER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  chrome: 'chrome',
  chromium: 'chrome',
  and_chr: 'chrome',
  android: 'chrome',
  webview: 'chrome',
  android_webview: 'chrome',
  edge: 'edge',
  safari: 'safari',
  firefox: 'firefox',
  ff: 'firefox',
  ios: 'ios_saf',
  ios_saf: 'ios_saf',
  ios_safari: 'ios_saf',
  samsung: 'samsung',
  samsung_internet: 'samsung',
})

/** Resolves a target name to a data key, or null when nothing is known about it. */
export function resolveBrowser(name: string): string | null {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return BROWSER_ALIASES[key] ?? null
}

/**
 * Compares dotted numeric versions.
 *
 * caniuse writes a range like `13.4-13.7` for releases it does not track
 * separately. The low end is the answer to "from which version does this
 * work", so that is the end this reads.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    String(value)
      .split('-')[0]!
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

/** The first version of `browser` supporting `feature`, or null if none does. */
export function supportedSince(feature: CompatFeature, browser: string): string | null {
  const table = FEATURE_SUPPORT[feature.source] as Record<string, string>
  return table[browser] ?? null
}

export interface CompatShortfall {
  /** Data key, e.g. `ios_saf`. */
  browser: string
  /** Display name, e.g. `iOS Safari`. */
  name: string
  /** The version you asked to support. */
  target: string
  /** The first version that would work, or null when no version does. */
  since: string | null
}

export interface CompatFinding {
  feature: CompatFeature
  /** The syntax as it actually appears, so a report can point at something. */
  sample: string
  /** Targets that fall short. Never empty. */
  shortfalls: CompatShortfall[]
}

export interface CompatAudit {
  findings: CompatFinding[]
  /** Features present in the CSS that every target already supports. */
  satisfied: CompatFeatureId[]
  /**
   * Target names with no support data, reported rather than skipped. A target
   * silently dropped from an audit is worse than no audit, because it reads as
   * a pass.
   */
  unknownBrowsers: string[]
}

/** A short excerpt around the first match, for a report to quote. */
function sampleAt(css: string, index: number, length: number): string {
  const start = Math.max(0, index)
  const end = Math.min(css.length, start + Math.max(length, 24) + 20)
  return css.slice(start, end).replace(/\s+/g, ' ').trim()
}

/** Which of the compiler's features appear in a stylesheet, in table order. */
export function detectFeatures(css: string): { feature: CompatFeature; sample: string }[] {
  const found: { feature: CompatFeature; sample: string }[] = []
  for (const feature of COMPAT_FEATURES) {
    if (!feature.detect) continue
    // Rebuilt per call rather than shared: a `g`-flagged literal would carry
    // `lastIndex` between audits and start skipping matches.
    const pattern = new RegExp(feature.detect.source, feature.detect.flags)
    const match = pattern.exec(css)
    if (!match) continue
    found.push({ feature, sample: sampleAt(css, match.index, match[0].length) })
  }
  return found
}

/**
 * Reports which browsers in `targets` cannot read the compiled stylesheet.
 *
 * `targets` maps a browser name to the oldest version you intend to support —
 * `{ safari: '14', ios_saf: 13 }`. Usage share is deliberately not consulted:
 * whether 0.4% of your users matters is a decision about your project, and
 * `browserslist` already exists to make it.
 */
export function auditCompatibility(
  css: string,
  targets: Readonly<Record<string, string | number>>,
): CompatAudit {
  const unknownBrowsers: string[] = []
  const resolved: { browser: string; target: string }[] = []
  for (const [name, version] of Object.entries(targets)) {
    const browser = resolveBrowser(name)
    if (!browser) {
      unknownBrowsers.push(name)
      continue
    }
    resolved.push({ browser, target: String(version) })
  }

  const findings: CompatFinding[] = []
  const satisfied: CompatFeatureId[] = []
  for (const { feature, sample } of detectFeatures(css)) {
    const shortfalls: CompatShortfall[] = []
    for (const { browser, target } of resolved) {
      const since = supportedSince(feature, browser)
      if (since !== null && compareVersions(target, since) >= 0) continue
      shortfalls.push({
        browser,
        name: BROWSER_NAMES[browser] ?? browser,
        target,
        since,
      })
    }
    if (shortfalls.length) findings.push({ feature, sample, shortfalls })
    else satisfied.push(feature.id)
  }
  return { findings, satisfied, unknownBrowsers }
}

/** Looks a feature up by id. */
export function compatFeature(id: CompatFeatureId): CompatFeature {
  const feature = BY_ID.get(id)
  if (!feature) throw new RangeError(`[postcss-adaptive-matrix] Unknown feature ${id}.`)
  return feature
}

export { FEATURE_SUPPORT }
export type { CaniuseFeatureId }
