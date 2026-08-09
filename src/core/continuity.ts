import type { AtRule, Container, Declaration, Document, Root, Rule } from 'postcss'

import { evaluateLength, splitComponents } from './evaluate.js'

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

const WIDTH_FEATURE = /^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/
/** Media types that describe a screen; anything else is not our business. */
const SCREEN_TYPES = new Set(['screen', 'all'])

/**
 * Splits a media query's params on `and`, rejecting anything with a comma,
 * `not`, or `only`.
 *
 * A rejected query is not skipped — it poisons every declaration under it, so
 * the whole group goes unchecked. Treating an unreadable condition as "always
 * true" would invent cascades that never happen and report steps that are not
 * there.
 */
function widthConditions(params: string): string[] | null {
  if (/[,]|\bnot\b|\bonly\b/i.test(params)) return null
  const parts = params.split(/\s+and\s+/i).map((part) => part.trim())
  const conditions: string[] = []
  for (const part of parts) {
    if (SCREEN_TYPES.has(part.toLowerCase())) continue
    if (!WIDTH_FEATURE.test(part)) return null
    conditions.push(part)
  }
  return conditions
}

function matches(condition: string, width: number): boolean {
  const parsed = WIDTH_FEATURE.exec(condition)
  if (!parsed) return false
  const bound = Number(parsed[2])
  return parsed[1] === 'min' ? width >= bound : width <= bound
}

function boundaryOf(condition: string): number | null {
  const parsed = WIDTH_FEATURE.exec(condition)
  return parsed ? Number(parsed[2]) : null
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
  let order = 0

  root.walkDecls((declaration: Declaration) => {
    // A custom property is not a length on screen, it is a value someone else
    // consumes — and the consumer decides which direction is wrong. This
    // compiler's own `--adaptive-root-width` is the clearest case: it feeds
    // `max(0px, (100vw - var(--adaptive-root-width)) / 2)`, so a *smaller*
    // value there means a *larger* gutter. Shrinking is the intent.
    //
    // The cost is that theme tokens go unchecked, and so does anything read
    // through `var()`. That is the honest trade: this check can only speak
    // about numbers whose meaning it knows.
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
    if (!entry.conditions.every((condition) => matches(condition, width))) continue
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

  const boundaries = new Set<number>()
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
    if (group.length < 2) continue
    for (const breakpoint of [...boundaries].sort((a, b) => a - b)) {
      const low = effective(group, breakpoint - PROBE)
      const high = effective(group, breakpoint + PROBE)
      if (!low || !high || low === high) continue

      const lowParts = splitComponents(low.value)
      const highParts = splitComponents(high.value)
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

        const identity = `${key}|${low.order}|${high.order}|${index}`
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
