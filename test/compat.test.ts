import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import adaptiveMatrix, {
  COMPAT_FEATURES,
  FEATURE_SUPPORT,
  auditCompatibility,
  compatFeature,
  detectFeatures,
} from '../src/index.js'
import type { AdaptiveMatrixOptions, CompatFeatureId } from '../src/index.js'
import { compareVersions, resolveBrowser } from '../src/core/compat.js'

const CASES_DIR = fileURLToPath(new URL('../conformance/cases', import.meta.url))

/** Every `<group>/<name>` directory in the conformance corpus. */
function caseDirs(): string[] {
  const dirs: string[] = []
  for (const group of readdirSync(CASES_DIR, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const entry of readdirSync(join(CASES_DIR, group.name), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(CASES_DIR, group.name, entry.name))
    }
  }
  return dirs
}

async function compile(
  css: string,
  options: AdaptiveMatrixOptions = {},
): Promise<string> {
  const result = await postcss([adaptiveMatrix(options)]).process(css, {
    from: '/project/src/app.css',
  })
  return result.css
}

function ids(css: string): CompatFeatureId[] {
  return detectFeatures(css).map(({ feature }) => feature.id)
}

/**
 * A configuration that turns the feature on, and the switch that turns it off.
 *
 * `nesting` and `has-pseudo` are absent because the compiler emits neither: both
 * reach the output from the source and there is no option that produces them.
 * The exhaustive `Record` is what forces that decision to be made explicitly —
 * a new feature cannot be added to the table without either an emitter here or
 * a deliberate exclusion.
 */
const EMITTERS: Record<
  Exclude<CompatFeatureId, 'nesting' | 'has-pseudo'>,
  { css: string; on: AdaptiveMatrixOptions; off: AdaptiveMatrixOptions }
> = {
  'cascade-layers': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: 'adaptive-matrix' } },
    off: { root: { selector: '#app', layer: false } },
  },
  'where-pseudo': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: false } },
    off: { root: false },
  },
  'container-queries': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: false, container: true } },
    off: { root: { selector: '#app', layer: false, container: false } },
  },
  'math-functions': {
    css: '.card { width: 100px }',
    on: { strategy: 'clamp' },
    off: { strategy: 'viewport' },
  },
  'container-query-units': {
    css: '.card { width: 100px }',
    on: { unit: 'cqi', strategy: 'viewport' },
    off: { unit: 'vw', strategy: 'viewport' },
  },
  'logical-viewport-units': {
    css: '.card { width: 100px }',
    on: { unit: 'vi', strategy: 'viewport' },
    off: { unit: 'vw', strategy: 'viewport' },
  },
  'logical-properties': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: false } },
    off: { root: { selector: '#app', layer: false, logical: false } },
  },
  'custom-properties': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: false, safeAreaVariables: true } },
    off: {
      root: {
        selector: '#app',
        layer: false,
        safeAreaVariables: false,
        fixedContainingBlock: false,
      },
    },
  },
  'env-function': {
    css: '.card { width: 100px }',
    on: { root: { selector: '#app', layer: false, safeAreaVariables: true } },
    off: { root: { selector: '#app', layer: false, safeAreaVariables: false } },
  },
  'viewport-units': {
    css: '.card { width: 100px }',
    on: { unit: 'vw' },
    off: { unit: 'vi' },
  },
}

describe('the feature table', () => {
  it('sources every version number from an entry that exists', () => {
    for (const feature of COMPAT_FEATURES) {
      expect(FEATURE_SUPPORT, feature.id).toHaveProperty(feature.source)
    }
  })

  it('says so when a version number comes from a stand-in entry', () => {
    // The two features caniuse does not track separately. A proxy presented
    // as a measurement is the failure mode this guards: the numbers would
    // look sourced while being inferred.
    expect(compatFeature('where-pseudo').proxy).toBeTruthy()
    expect(compatFeature('logical-viewport-units').proxy).toBeTruthy()
    const exact = COMPAT_FEATURES.filter((feature) => !feature.proxy)
    expect(exact.length).toBe(COMPAT_FEATURES.length - 2)
  })

  it('names a real off switch for everything it can detect', () => {
    for (const feature of COMPAT_FEATURES) {
      if (!feature.detect) continue
      expect(feature.fallback.length, feature.id).toBeGreaterThan(40)
      expect(feature.emittedBy, feature.id).toBeTruthy()
      expect(feature.failure, feature.id).toBeTruthy()
    }
  })
})

describe('detection', () => {
  it('finds each feature in output the compiler actually produced', async () => {
    for (const [id, { css, on }] of Object.entries(EMITTERS)) {
      expect(ids(await compile(css, on)), id).toContain(id)
    }
  })

  it('loses each feature when its documented switch is thrown', async () => {
    for (const [id, { css, off }] of Object.entries(EMITTERS)) {
      expect(ids(await compile(css, off)), id).not.toContain(id)
    }
  })

  it('does not mistake a media query for a math function', () => {
    // `(min-width: 768px)` contains `min-width`, and a naive `min` test would
    // report clamp() support as a requirement of every breakpointed stylesheet.
    const css = '@media (min-width: 768px) and (max-width: 900px) { .a { width: 50vw } }'
    expect(ids(css)).not.toContain('math-functions')
  })

  it('does not mistake other identifiers for viewport units', () => {
    const css = '.a { transition: 1s; font-family: Avi; width: 12vmin; color: #0cq1 }'
    const found = ids(css)
    expect(found).not.toContain('logical-viewport-units')
    expect(found).not.toContain('container-query-units')
    expect(found).not.toContain('viewport-units')
  })

  it('reports :has() that came in through the source', async () => {
    // The compiler emits no `:has()`. It survives the pass, and surviving is
    // exactly why it belongs in an audit that reads the output: the rule ships
    // whether or not this plugin wrote it, and Firefox read nothing before 121.
    const css = await compile('.card:has(.badge) { padding: 16px }')
    expect(css).toContain(':has(.badge)')
    expect(ids(css)).toContain('has-pseudo')

    const audit = auditCompatibility(css, { firefox: '115', chrome: '120' })
    const finding = audit.findings.find((entry) => entry.feature.id === 'has-pseudo')!
    expect(finding.shortfalls.map((shortfall) => shortfall.browser)).toEqual(['firefox'])
    expect(finding.shortfalls[0]!.since).toBe('121')
  })

  it('does not read :not() or a --has- token as :has()', () => {
    // The two things in a real stylesheet that look like it. A `:has(` written
    // inside a string is not covered, here or by any other entry in the table:
    // detection reads text, and no feature is worth a CSS parser to rule out a
    // stylesheet whose content property quotes a selector.
    const css = '.a:not(.b) { --has-badge: 1px; padding: 8px }'
    expect(ids(css)).not.toContain('has-pseudo')
  })

  it('starts from the beginning on every call', () => {
    // A shared global regex would carry lastIndex forward and start missing
    // matches from the second audit onwards.
    const css = '.a { width: clamp(1px, 2vw, 3px) }'
    expect(ids(css)).toEqual(ids(css))
    expect(ids(css)).toContain('math-functions')
  })
})

describe('version comparison', () => {
  it('reads the low end of a caniuse range', () => {
    // `13.4-13.7` means "from 13.4", so 13.4 is enough and 13.3 is not.
    expect(compareVersions('13.4', '13.4-13.7')).toBe(0)
    expect(compareVersions('13.3', '13.4-13.7')).toBeLessThan(0)
    expect(compareVersions('14', '13.4-13.7')).toBeGreaterThan(0)
  })

  it('compares segment by segment rather than as decimals', () => {
    // 15.10 is newer than 15.9; read as a decimal it would look older.
    expect(compareVersions('15.10', '15.9')).toBeGreaterThan(0)
    expect(compareVersions('16', '16.0')).toBe(0)
    expect(compareVersions('9', '10')).toBeLessThan(0)
  })

  it('resolves the names people actually write', () => {
    expect(resolveBrowser('iOS Safari')).toBe('ios_saf')
    expect(resolveBrowser('ios')).toBe('ios_saf')
    // Android WebViews run Chrome, and caniuse has no separate history for them.
    expect(resolveBrowser('android')).toBe('chrome')
    expect(resolveBrowser('webview')).toBe('chrome')
    expect(resolveBrowser('netscape')).toBeNull()
  })
})

describe('auditCompatibility', () => {
  const preset: AdaptiveMatrixOptions = {
    root: { selector: '#app', layer: 'adaptive-matrix' },
    profiles: {
      app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, rootMaxWidth: 480 },
    },
    defaultProfile: 'app',
  }

  it('reports the features an old target cannot read, and what it loses', async () => {
    const css = await compile('.card { width: 100px }', preset)
    const audit = auditCompatibility(css, { ios_saf: '13' })

    const reported = audit.findings.map((finding) => finding.feature.id)
    expect(reported).toContain('cascade-layers')
    expect(reported).toContain('where-pseudo')
    // clamp() landed in iOS 13.4, so 13 is short by a point release. That the
    // audit catches a gap this narrow is the reason it compares versions
    // rather than eyeballing a major.
    expect(reported).toContain('math-functions')

    const layer = audit.findings.find((f) => f.feature.id === 'cascade-layers')!
    expect(layer.shortfalls).toEqual([
      { browser: 'ios_saf', name: 'iOS Safari', target: '13', since: '15.4' },
    ])
    expect(layer.sample).toContain('@layer')
  })

  it('passes a modern target and counts what it checked', async () => {
    const css = await compile('.card { width: 100px }', preset)
    const audit = auditCompatibility(css, { ios_saf: '17', chrome: '120' })

    expect(audit.findings).toEqual([])
    expect(audit.satisfied).toContain('cascade-layers')
    expect(audit.satisfied).toContain('math-functions')
  })

  it('separates the targets that fall short from the ones that do not', async () => {
    const css = await compile('.card { width: 100px }', preset)
    const audit = auditCompatibility(css, { ios_saf: '13', chrome: '120' })

    for (const finding of audit.findings) {
      expect(finding.shortfalls.map((s) => s.browser)).toEqual(['ios_saf'])
    }
  })

  it('reports an unrecognised target instead of skipping it', async () => {
    // A target dropped in silence reads as a pass, which is worse than no
    // audit at all — the caller asked about it and got a clean result back.
    const css = await compile('.card { width: 100px }', preset)
    const audit = auditCompatibility(css, { netscape: '4' })
    expect(audit.unknownBrowsers).toEqual(['netscape'])
  })

  it('audits authored CSS the compiler never touched', async () => {
    // The stylesheet is what ships. A feature that arrived through the author's
    // own hand is still a support requirement of the output.
    const css = await compile('@supports (display: grid) { .a:has(.b) { color: red } }')
    const audit = auditCompatibility(css, { ios_saf: '13' })
    expect(audit.findings.map((f) => f.feature.id)).not.toContain('cascade-layers')
    // Nothing was converted, so the only requirements are the author's own.
    expect(css).toContain('@supports')
  })
})

describe('root.logical', () => {
  const base = { selector: '#app', layer: false as const }

  it('writes logical properties by default', async () => {
    const css = await compile('.a { color: red }', {
      root: base,
      profiles: {
        app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, rootMaxWidth: 480 },
      },
      defaultProfile: 'app',
    })
    expect(css).toContain('inline-size: 100%')
    expect(css).toContain('margin-inline: auto')
    expect(css).toContain('max-inline-size: 480px')
  })

  it('writes the physical spellings instead when asked, and no logical ones', async () => {
    const css = await compile('.a { color: red }', {
      root: { ...base, logical: false },
      profiles: {
        app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, rootMaxWidth: 480 },
      },
      defaultProfile: 'app',
    })
    expect(css).toContain('width: 100%')
    expect(css).toContain('margin-left: auto')
    expect(css).toContain('margin-right: auto')
    expect(css).toContain('max-width: 480px')
    expect(ids(css)).not.toContain('logical-properties')
  })

  it('keeps the two spellings equivalent on every declaration it writes', async () => {
    // Same rules, same order, differing only in property names — the switch is
    // a rename, not a different foundation.
    const options = (logical: boolean): AdaptiveMatrixOptions => ({
      root: { ...base, logical, fixedContainingBlock: true },
      profiles: {
        app: { designWidth: 375, fluid: { minWidth: 320, maxWidth: 480 }, rootMaxWidth: 480 },
      },
      defaultProfile: 'app',
    })
    const logical = await compile('.a { color: red }', options(true))
    const physical = await compile('.a { color: red }', options(false))
    const normalise = (css: string) =>
      css
        .replace(/\binline-size\b/g, 'W')
        .replace(/\bwidth\b/g, 'W')
        .replace(/\bmargin-inline: auto;?/g, 'C')
        .replace(/\bmargin-left: auto;\s*margin-right: auto;?/g, 'C')
        .replace(/\bmax-W: /g, 'M: ')
        .replace(/\s+/g, ' ')
    expect(normalise(physical)).toBe(normalise(logical))
  })
})

describe('the table covers everything the compiler emits', () => {
  /**
   * Which table entry accounts for each piece of syntax the compiler writes.
   *
   * Stated here rather than derived from the detectors on purpose. The
   * detectors are the implementation; this is a second, independent account of
   * the same claim, and a new kind of output has to be added to both before
   * the suite will accept it.
   */
  const CLASSIFIED: Record<string, CompatFeatureId> = {
    '@layer': 'cascade-layers',
    '@container': 'container-queries',
    container: 'container-queries',
    ':where()': 'where-pseudo',
    'env()': 'env-function',
    'var()': 'custom-properties',
    '--custom': 'custom-properties',
    'clamp()': 'math-functions',
    'min()': 'math-functions',
    'max()': 'math-functions',
    vw: 'viewport-units',
    vi: 'logical-viewport-units',
    cqw: 'container-query-units',
    cqi: 'container-query-units',
    'inline-size': 'logical-properties',
    'max-inline-size': 'logical-properties',
    'margin-inline': 'logical-properties',
  }

  /**
   * Syntax with no entry, and no need of one.
   *
   * These are the three things the compiler writes no matter how it is
   * configured, and all of them predate by a decade the newest feature it can
   * emit. A stylesheet would have to require nothing else at all before any of
   * them became the binding constraint, so an entry could never change an
   * answer. The physical property names appear only with `root.logical: false`,
   * which is itself the fallback for the logical ones.
   */
  const BASELINE = new Set([
    '@media',
    'calc()',
    '%',
    'px',
    'rem',
    'width',
    'max-width',
    'margin-left',
    'margin-right',
  ])

  it('classifies each token against a feature the table actually has', () => {
    for (const [token, id] of Object.entries(CLASSIFIED)) {
      expect(compatFeature(id).id, token).toBe(id)
    }
  })

  /**
   * The syntactic features a stylesheet uses, as parsed rather than as text.
   *
   * Reading the text directly meant class names, comments and the colon in
   * `width:calc(...)` all came back as findings. PostCSS already knows which
   * span is a selector and which is a value; asking it is both shorter and
   * right.
   */
  function syntaxTokens(css: string): Set<string> {
    const tokens = new Set<string>()
    const root = postcss.parse(css)
    root.walkAtRules((rule) => {
      tokens.add(`@${rule.name.toLowerCase()}`)
    })
    root.walkRules((rule) => {
      for (const [, name] of rule.selector.matchAll(/:(:?[a-zA-Z-]+)\(/g)) {
        tokens.add(`:${name!.toLowerCase()}()`)
      }
    })
    root.walkDecls((declaration) => {
      tokens.add(declaration.prop.toLowerCase().replace(/^--.*/, '--custom'))
      for (const [, name] of declaration.value.matchAll(/(?:^|[^\w.-])([a-zA-Z][\w-]*)\(/g)) {
        tokens.add(`${name!.toLowerCase()}()`)
      }
      for (const [, unit] of declaration.value.matchAll(/[\d.]+([a-z]+|%)(?![\w-])/gi)) {
        tokens.add(unit!.toLowerCase())
      }
    })
    return tokens
  }

  it('classifies every kind of syntax the conformance corpus gains in compilation', () => {
    // Input against output, per case: what the compiler *added* is exactly
    // what it is answerable for. Anything the author already wrote is theirs,
    // and this compiler is not a general-purpose CSS support linter.
    const unclassified = new Map<string, string>()
    const observed = new Set<string>()
    let cases = 0
    for (const dir of caseDirs()) {
      const before = syntaxTokens(readFileSync(join(dir, 'input.css'), 'utf8'))
      const after = syntaxTokens(readFileSync(join(dir, 'expected.css'), 'utf8'))
      cases += 1
      for (const token of after) {
        if (before.has(token)) continue
        if (token in CLASSIFIED) observed.add(token)
        else if (!BASELINE.has(token) && !unclassified.has(token)) {
          unclassified.set(token, dir)
        }
      }
    }

    // Read from disk, so a passing result would otherwise be indistinguishable
    // from a glob that matched nothing and a classifier that never ran.
    expect(cases).toBeGreaterThan(20)
    expect([...observed].sort()).toEqual(
      expect.arrayContaining([
        '--custom',
        '@container',
        '@layer',
        ':where()',
        'clamp()',
        'env()',
        'inline-size',
        'var()',
        'vw',
      ]),
    )
    expect(Object.fromEntries([...unclassified].sort())).toEqual({})
  })
})
