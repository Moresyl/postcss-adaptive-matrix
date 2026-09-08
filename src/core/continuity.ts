import type { AtRule, Container, Declaration, Document, Root, Rule } from 'postcss'

import { evaluateLength, splitComponents } from './evaluate.js'
import { rootGutterReferenceRanges } from './fixed.js'
import { allMatch, boundaryOf, widthConditions } from './media.js'
import { collectTokens } from './tokens.js'
import { canonicalCssPropertyName, canonicalizeCssIdentifierEscapes } from './syntax.js'

/**
 * One place where a length moves backwards as the viewport grows.
 *
 * A positive bounded formula is non-decreasing in viewport width. The analyzer
 * uses that fact as a sampled diagnostic across canvas breakpoints; it does not
 * prove every width or infer whether a value came from this compiler.
 *
 * That disagreement is invisible in the source: both numbers are plausible on
 * their own, and each canvas renders correctly in isolation. It shows up only
 * at one specific width, in a browser, as text that shrinks when the window is
 * widened — which is why it is worth computing rather than eyeballing.
 */
export interface ContinuityIssue {
  selector: string
  prop: string
  /** Viewport width, in pixels, at which the value steps backwards. */
  breakpoint: number
  below: { value: string; px: number }
  above: { value: string; px: number }
}

interface Entry {
  selector: string
  prop: string
  value: string
  conditions: string[]
  layer: string
  important: boolean
  order: number
}

const NOMINAL_HEIGHT = 800
const ROOT_FONT_SIZE = 16
/** Half the width of the probe straddling a breakpoint. */
const PROBE = 0.05
/** Below this, a difference is rounding, not a step. */
const EPSILON = 0.01

/**
 * Recognizes fluid/math expressions, including unbounded viewport output.
 * This is a heuristic, not provenance: authored expressions also qualify.
 * Plain fixed-pixel changes stay excluded because they commonly encode an
 * intentional layout decision rather than a fluid canvas transition.
 */
const COMPILED = /\b(?:clamp|min|max|calc)\s*\(|[\d.](?:[sld]?v(?:w|h|i|b|min|max))\b/i

function isFluidExpression(value: string): boolean {
  return COMPILED.test(value.includes('\\') ? canonicalizeCssIdentifierEscapes(value).text : value)
}

/**
 * Drops the fixed-position gutter out of a value before it is compared.
 *
 * The gutter is `max(0px, (100vw - column) / 2)` — the distance from the
 * viewport edge to the root column — and it is *meant* to step at a breakpoint,
 * because that is where the column changes width. A tab bar authored as
 * `left: 0` becomes `left: var(--adaptive-root-gutter)`, which on a 480px app
 * column sits 144px in at 768px wide and, one pixel later on a 1920px desktop
 * column, correctly sits flush at 0. Read as a design length that would be a
 * step backwards; read as what it is, it is the correction working.
 *
 * Substituting zero rather than skipping the declaration keeps the rest of the
 * value under scrutiny: `left: calc(clamp(…) + var(--adaptive-root-gutter))`
 * still has its `clamp()` compared across the seam. Silencing the whole
 * declaration would have hidden a genuine disagreement behind a correction this
 * compiler added itself.
 *
 * Left in on purpose: this fires for every fixed element in a project using the
 * two-canvas preset, which is most of them, and a check that cries wolf on the
 * default configuration is a check people learn to skip.
 */
function withoutGutter(value: string): string {
  const ranges = rootGutterReferenceRanges(value)
  let output = value
  for (const [start, end] of ranges.reverse()) {
    output = `${output.slice(0, start)}0px${output.slice(end)}`
  }
  return output
}

/**
 * Walks the tree once, recording every declaration together with the width
 * conditions and cascade layer it sits under.
 *
 * Returns `null` for a declaration whose surroundings cannot be reduced to a
 * width test: `@supports`, `@container`, an unreadable media query. Its group
 * is then dropped whole.
 */
function collect(root: Root): { entries: Entry[]; poisoned: Set<string> } {
  const entries: Entry[] = []
  const poisoned = new Set<string>()
  const anonymousLayers = new WeakMap<AtRule, string>()
  let nextAnonymousLayer = 0
  let order = 0

  root.walkDecls((declaration: Declaration) => {
    // A custom property is not a length on screen, it is a value someone else
    // consumes — and the consumer decides which direction is wrong. This
    // compiler's own `--adaptive-root-width` is the clearest case: it feeds
    // `max(0px, (100vw - var(--adaptive-root-width)) / 2)`, so a *smaller*
    // value there means a *larger* gutter. Shrinking is the intent.
    //
    // Skipping the declaration is not the same as ignoring the token: the
    // consumer *is* checked, with the token substituted in (see `tokens.ts`),
    // which is where its direction finally has a meaning to be wrong about.
    const prop = canonicalCssPropertyName(declaration.prop)
    if (prop.startsWith('--')) return
    // Standard property names are ASCII case-insensitive in CSS. Grouping the
    // authored spelling would split `FONT-SIZE` and `font-size` into unrelated
    // declarations even though the cascade treats them as the same property.

    const conditions: string[] = []
    const layers: string[] = []
    let readable = true
    let selector: string | null = null

    let node: Container | Document | undefined = declaration.parent
    while (node && node.type !== 'root') {
      if (node.type === 'rule') {
        // A nested rule would make the effective selector a join of several,
        // which is more cascade than this check claims to model.
        if (selector !== null) return
        selector = (node as Rule).selector.trim()
      } else if (node.type === 'atrule') {
        const at = node as AtRule
        const name = at.name.toLowerCase()
        if (name === 'media') {
          const parsed = widthConditions(at.params)
          if (!parsed) readable = false
          else conditions.push(...parsed)
        } else if (name === 'layer') {
          const named = at.params.trim()
          if (named) layers.push(named)
          else {
            let identity = anonymousLayers.get(at)
            if (!identity) {
              nextAnonymousLayer += 1
              identity = `\0anonymous-layer-${nextAnonymousLayer}`
              anonymousLayers.set(at, identity)
            }
            layers.push(identity)
          }
        } else {
          readable = false
        }
      }
      node = node.parent
    }

    if (selector === null) return
    const key = `${selector}|${prop}`
    if (!readable) {
      poisoned.add(key)
      return
    }
    entries.push({
      selector,
      prop,
      value: declaration.value,
      conditions,
      layer: layers.reverse().join('.'),
      important: declaration.important,
      order: order++,
    })
  })

  return { entries, poisoned }
}

/** The declaration that wins at `width`, by source order among those that apply. */
function effective(group: Entry[], width: number): Entry | undefined {
  let winner: Entry | undefined
  for (const entry of group) {
    if (!allMatch(entry.conditions, width)) continue
    if (
      !winner ||
      (entry.important && !winner.important) ||
      (entry.important === winner.important && entry.order > winner.order)
    ) {
      winner = entry
    }
  }
  return winner
}

/**
 * Reports every (selector, property) whose computed length shrinks as the
 * viewport crosses a breakpoint upward.
 *
 * Scope is deliberately narrow, because a diagnostic that cries wolf gets
 * switched off: one selector at a time, no specificity arithmetic, no
 * shorthand expansion, and silence whenever a value or a condition falls
 * outside what can be resolved to a number.
 */
export function findContinuityIssues(
  root: Root | Document,
  rootFontSize: number = ROOT_FONT_SIZE,
): ContinuityIssue[] {
  if (!Number.isFinite(rootFontSize) || rootFontSize <= 0) {
    throw new RangeError('rootFontSize must be a positive finite number')
  }
  // Document roots may represent independent embedded stylesheets. Never
  // synthesize a cascade or share custom-property values across those roots.
  if (root.type === 'document') {
    return root.nodes.flatMap((child) => findContinuityIssues(child, rootFontSize))
  }
  const { entries, poisoned } = collect(root)
  const tokens = collectTokens(root)

  const boundaries = new Set<number>(tokens.boundaries)
  for (const entry of entries) {
    for (const condition of entry.conditions) {
      const bound = boundaryOf(condition)
      if (bound !== null) boundaries.add(bound)
    }
  }
  if (!boundaries.size) return []

  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = `${entry.selector}|${entry.prop}`
    if (poisoned.has(key)) continue
    // Mixed layers put the winner beyond source order: an unlayered
    // declaration beats a layered one no matter where it was written.
    const group = groups.get(key)
    if (group && group[0]!.layer !== entry.layer) {
      poisoned.add(key)
      groups.delete(key)
      continue
    }
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }

  const issues: ContinuityIssue[] = []
  // Keyed by which two declarations swapped places, not by the boundary that
  // revealed it. `(max-width: 767.98px)` and `(min-width: 768px)` are two
  // boundaries describing one transition, and each straddling probe finds the
  // same step. Ascending order then means the last boundary to confirm it is
  // the width where the new canvas actually takes over — 768, not 767.98.
  const byTransition = new Map<string, ContinuityIssue>()
  // All groups use the same declaration/token boundaries. Sort once rather
  // than allocating and sorting the same set for every selector/property.
  const sortedBoundaries = [...boundaries].sort((a, b) => a - b)
  // Gutter removal depends only on authored text, not on the probe width.
  // Keep this cache local to one analysis; token substitution remains per probe.
  const gutterless = new Map<Entry, string>()
  const valueWithoutGutter = (entry: Entry): string => {
    let value = gutterless.get(entry)
    if (value === undefined) {
      value = withoutGutter(entry.value)
      gutterless.set(entry, value)
    }
    return value
  }

  for (const [key, group] of groups) {
    // One declaration cannot disagree with itself — unless it reads a token
    // that the stylesheet redefines at a breakpoint, which is the same
    // disagreement one level down and shows up as two different resolved
    // values below.
    // Include escaped function names such as `v\\61 r(...)`, which CSS treats
    // as `var(...)` and the token resolver can therefore evaluate.
    if (group.length < 2 && !/var\(|\\/i.test(group[0]!.value)) continue
    for (const breakpoint of sortedBoundaries) {
      // There is no viewport below zero. Probing the synthetic negative side
      // of `(max-width: 0px)` can invent a cascade transition no browser can
      // ever render, so it is not a continuity seam.
      if (breakpoint <= PROBE) continue
      const low = effective(group, breakpoint - PROBE)
      const high = effective(group, breakpoint + PROBE)
      if (!low || !high) continue

      // Tokens are substituted at each probe width separately, so a token
      // redefined across the breakpoint is compared at the value that actually
      // applies on each side. `null` means the value reads something this
      // cannot pin down, and the pair is dropped.
      const lowValue = tokens.resolve(valueWithoutGutter(low), breakpoint - PROBE)
      const highValue = tokens.resolve(valueWithoutGutter(high), breakpoint + PROBE)
      if (lowValue === null || highValue === null || lowValue === highValue) continue
      // Substitution happens first: a token can hold the generated formula
      // while the declaration reading it is a bare `var()`.
      if (!isFluidExpression(lowValue) && !isFluidExpression(highValue)) continue

      const lowParts = splitComponents(lowValue)
      const highParts = splitComponents(highValue)
      if (lowParts.length !== highParts.length) continue

      for (const [index, lowPart] of lowParts.entries()) {
        const highPart = highParts[index]!
        const lowPx = evaluateLength(lowPart, {
          width: breakpoint - PROBE,
          height: NOMINAL_HEIGHT,
          rootFontSize,
        })
        const highPx = evaluateLength(highPart, {
          width: breakpoint + PROBE,
          height: NOMINAL_HEIGHT,
          rootFontSize,
        })
        if (lowPx === null || highPx === null) continue
        // Compared by magnitude, not by value. A negative length — an overhang,
        // a pulled-in gutter — is drawn *bigger* by moving further from zero,
        // and the compiler scales it that way: `-16px` on a 375 canvas becomes
        // `clamp(-20.48px, -4.26667vw, -13.65333px)`, which falls as the
        // viewport grows. Reading that as a step backwards inverted the check
        // for every negative length: `-20.48px → -28.44px`, the wider canvas
        // asking for a deeper overhang, was reported, while `-20.48px →
        // -2.84px`, where the overhang all but vanishes at the breakpoint, was
        // not. For non-negative values `|a| < |b|` and `a < b` agree, so this
        // leaves the ordinary case exactly as it was.
        //
        // A sign change is left alone. Zero is a boundary the compiler does not
        // cross on its own, so meeting one here means the two canvases were
        // written with different intents, and which of them is wrong is not
        // something this can know.
        if (lowPx < 0 !== highPx < 0) continue
        if (Math.abs(highPx) >= Math.abs(lowPx) - EPSILON) continue

        // The resolved values are part of the identity, not just the two
        // declarations: one declaration reading a token that is redefined at
        // 768 and again at 1024 is one pair of orders but two transitions.
        const identity = `${key}|${low.order}|${high.order}|${index}|${lowPart}|${highPart}`
        const already = byTransition.get(identity)
        if (already) {
          already.breakpoint = breakpoint
          already.below.px = lowPx
          already.above.px = highPx
          continue
        }
        const issue: ContinuityIssue = {
          selector: group[0]!.selector,
          prop: group[0]!.prop,
          breakpoint,
          below: { value: lowPart, px: lowPx },
          above: { value: highPart, px: highPx },
        }
        byTransition.set(identity, issue)
        issues.push(issue)
      }
    }
  }

  return issues
}
