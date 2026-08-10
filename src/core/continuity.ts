import type { AtRule, Container, Declaration, Document, Root, Rule } from 'postcss'

import { evaluateLength, splitComponents } from './evaluate.js'
import { allMatch, boundaryOf, widthConditions } from './media.js'
import { collectTokens } from './tokens.js'

/**
 * One place where a length moves backwards as the viewport grows.
 *
 * Every formula this compiler emits is non-decreasing in viewport width — a
 * `clamp()` of positive bounds cannot shrink. So a length that gets *smaller*
 * on a wider screen can only come from crossing a breakpoint into a different
 * canvas, where the two design files disagree about that element.
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
  order: number
}

const NOMINAL_HEIGHT = 800
const ROOT_FONT_SIZE = 16
/** Half the width of the probe straddling a breakpoint. */
const PROBE = 0.05
/** Below this, a difference is rounding, not a step. */
const EPSILON = 0.01

/**
 * Marks a value as compiler output rather than something a person typed.
 *
 * Bounded fluid sizing has no unwrapped form — every viewport-relative length
 * this compiler emits sits inside one of these functions, and no expected
 * output in the conformance suite contains a bare `vw`.
 *
 * The distinction matters because the completeness argument above only covers
 * formulas *this* compiler produced. A stylesheet it deliberately leaves alone
 * can shrink at a breakpoint because its author decided it should: Quasar draws
 * `.q-tooltip` with 16px of padding on a phone and 10px from 600px up, which is
 * a touch-target decision, not two canvases disagreeing. Reporting that as a
 * seam is noise — the author typed both numbers and meant them. A seam is worth
 * flagging precisely when nobody ever compared the two sides, which requires at
 * least one of them to have been generated.
 */
const COMPILED = /\b(?:clamp|min|max|calc)\s*\(/i

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
    if (declaration.prop.startsWith('--')) return

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
          layers.push(at.params.trim())
        } else {
          readable = false
        }
      }
      node = node.parent
    }

    if (selector === null) return
    const key = `${selector}|${declaration.prop}`
    if (!readable) {
      poisoned.add(key)
      return
    }
    entries.push({
      selector,
      prop: declaration.prop,
      value: declaration.value,
      conditions,
      layer: layers.reverse().join('.'),
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
    if (!winner || entry.order > winner.order) winner = entry
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
export function findContinuityIssues(root: Root): ContinuityIssue[] {
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

  for (const [key, group] of groups) {
    // One declaration cannot disagree with itself — unless it reads a token
    // that the stylesheet redefines at a breakpoint, which is the same
    // disagreement one level down and shows up as two different resolved
    // values below.
    if (group.length < 2 && !group[0]!.value.includes('var(')) continue
    for (const breakpoint of [...boundaries].sort((a, b) => a - b)) {
      const low = effective(group, breakpoint - PROBE)
      const high = effective(group, breakpoint + PROBE)
      if (!low || !high) continue

      // Tokens are substituted at each probe width separately, so a token
      // redefined across the breakpoint is compared at the value that actually
      // applies on each side. `null` means the value reads something this
      // cannot pin down, and the pair is dropped.
      const lowValue = tokens.resolve(low.value, breakpoint - PROBE)
      const highValue = tokens.resolve(high.value, breakpoint + PROBE)
      if (lowValue === null || highValue === null || lowValue === highValue) continue
      // Substitution happens first: a token can hold the generated formula
      // while the declaration reading it is a bare `var()`.
      if (!COMPILED.test(lowValue) && !COMPILED.test(highValue)) continue

      const lowParts = splitComponents(lowValue)
      const highParts = splitComponents(highValue)
      if (lowParts.length !== highParts.length) continue

      for (const [index, lowPart] of lowParts.entries()) {
        const highPart = highParts[index]!
        const lowPx = evaluateLength(lowPart, {
          width: breakpoint - PROBE,
          height: NOMINAL_HEIGHT,
          rootFontSize: ROOT_FONT_SIZE,
        })
        const highPx = evaluateLength(highPart, {
          width: breakpoint + PROBE,
          height: NOMINAL_HEIGHT,
          rootFontSize: ROOT_FONT_SIZE,
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
